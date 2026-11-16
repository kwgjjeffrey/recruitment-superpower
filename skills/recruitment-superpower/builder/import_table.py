"""Inspect local CSV/TSV/XLSX/JSON data and import through authenticated Superpower APIs."""
import argparse
from contextlib import contextmanager
import csv
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from uuid import UUID, uuid4

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).absolute().parents[1]))
from utils.runtime_client import request

TYPES = {'text', 'integer', 'bigint', 'numeric', 'boolean', 'uuid', 'date', 'timestamptz', 'jsonb'}
NUMBER = re.compile(r'^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$')
INTEGER = re.compile(r'^-?(?:0|[1-9]\d*)$')
LIMIT = 96 * 1024  # Leaves room below the daemon's 128 KiB request boundary.

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), default=str).encode()

def text(value):
    if value is None or value == '': return None
    if isinstance(value, bool): return str(value).lower()
    if isinstance(value, (datetime, date)): return value.isoformat()
    if isinstance(value, (dict, list)): return encoded(value).decode()
    return str(value)

def names(headers):
    used = set(); result = []
    for index, header in enumerate(headers):
        stem = re.sub(r'[^a-z0-9]+', '_', unicodedata.normalize('NFKD', header).lower()).strip('_')
        base = (stem if re.match('[a-z]', stem) else 'column_' + (stem or str(index + 1)))[:55]
        name = base; suffix = 2
        while name in used: name = base + '_' + str(suffix); suffix += 1
        used.add(name); result.append(name)
    return result

@contextmanager
def source(path, sheet=None, encoding='utf-8-sig'):
    """CSV and XLSX are iterated; JSON may be materialized to reshape object rows."""
    suffix = path.suffix.lower()
    if suffix in ('.csv', '.tsv'):
        with path.open(encoding=encoding, newline='') as handle:
            sample = handle.read(8192); handle.seek(0)
            try: dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
            except csv.Error: dialect = csv.excel_tab if suffix == '.tsv' else csv.excel
            reader = csv.reader(handle, dialect)
            yield list(next(reader, [])), reader, None, [], None
    elif suffix == '.xlsx':
        try: from openpyxl import load_workbook
        except ImportError as error: raise ValueError('XLSX needs openpyxl. Install builder/requirements-import.txt in the Python environment used for this command.') from error
        book = load_workbook(path, read_only=True, data_only=True)
        try:
            selected = sheet or book.sheetnames[0]
            if selected not in book.sheetnames: raise ValueError('Unknown worksheet: ' + selected)
            reader = book[selected].iter_rows(values_only=True); headers = list(next(reader, []))
            while headers and headers[-1] is None: headers.pop()
            yield headers, reader, selected, book.sheetnames, None
        finally: book.close()
    elif suffix == '.json':
        value = json.loads(path.read_text(encoding=encoding), parse_float=Decimal)
        declared = value.get('columns') if isinstance(value, dict) else None
        rows = value.get('rows') if isinstance(value, dict) else value
        if not isinstance(rows, list): raise ValueError('JSON must contain an array of objects, an array with a header row, or {columns, rows}.')
        if declared:
            headers = [c['name'] for c in declared]
        elif rows and all(isinstance(row, dict) for row in rows):
            headers = list(dict.fromkeys(key for row in rows for key in row))
        elif rows and isinstance(rows[0], list):
            yield rows[0], iter(rows[1:]), None, [], None; return
        else: raise ValueError('An empty JSON file needs explicit columns.')
        if any(not isinstance(row, dict) or any(key not in headers for key in row) for row in rows): raise ValueError('JSON object rows must use the declared columns. Reshape the data first.')
        yield headers, ([row.get(header) for header in headers] for row in rows), None, [], declared
    else: raise ValueError('Use CSV, TSV, XLSX or JSON. Convert other formats to a supported copy first.')

def rows(reader, width, preserve_empty=False):
    for line, raw in enumerate(reader, 2):
        values = ["" if preserve_empty and v == "" else text(v) for v in raw]
        if not any(v is not None for v in values): continue
        if len(values) > width and any(v is not None for v in values[width:]): raise ValueError(f'Row {line} has more fields than its header. Reshape the file first.')
        yield (values[:width] + [None] * width)[:width]

def candidates(value):
    if value is None: return {'text', 'boolean', 'bigint', 'numeric'}
    allowed = {'text'}
    if value.lower() in ('true', 'false'): allowed.add('boolean')
    if INTEGER.fullmatch(value) and -(2**63) <= int(value) < 2**63: allowed.add('bigint')
    if NUMBER.fullmatch(value): allowed.add('numeric')
    return allowed

def validate_cell(value, column):
    if value is None:
        if column.get('nullable') is False: raise ValueError('NULL is not allowed')
        return
    kind = column['type']
    if kind in ('integer', 'bigint'):
        if not INTEGER.fullmatch(value): raise ValueError('expected an integer')
        bits = 32 if kind == 'integer' else 64
        if not -(2**(bits-1)) <= int(value) < 2**(bits-1): raise ValueError('integer out of range')
    elif kind == 'numeric':
        if not NUMBER.fullmatch(value) or not Decimal(value).is_finite(): raise ValueError('expected a finite exact number')
    elif kind == 'boolean' and value.lower() not in ('true', 'false'): raise ValueError('expected true or false')
    elif kind == 'uuid': UUID(value)
    elif kind == 'date': date.fromisoformat(value)
    elif kind == 'timestamptz': datetime.fromisoformat(value.replace('Z', '+00:00'))
    elif kind == 'jsonb': json.loads(value)

def fingerprint(path):
    with path.open('rb') as handle: return hashlib.file_digest(handle, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else _hash(handle)

def _hash(handle):
    digest = hashlib.sha256()
    for chunk in iter(lambda: handle.read(1024 * 1024), b''): digest.update(chunk)
    return digest.hexdigest()

def inspect_file(path, sheet=None, encoding='utf-8-sig', schema=None):
    digest = fingerprint(path)
    with source(path, sheet, encoding) as (raw_headers, reader, selected, sheets, declared):
        if not 1 <= len(raw_headers) <= 100: raise ValueError('Use a header with 1–100 columns.')
        headers = [text(h) or f'Column {i+1}' for i, h in enumerate(raw_headers)]
        if any(len(h) > 2000 for h in headers): raise ValueError('Shorten headers to 2,000 characters.')
        columns = schema if schema is not None else declared
        if columns is not None:
            if not isinstance(columns, list) or len(columns) != len(headers): raise ValueError('Schema must contain one column per source field, in source order.')
            columns = [{**c, 'description': c.get('description', headers[i])} for i, c in enumerate(columns)]
            if any(set(c) - {'name','type','description','nullable'} or not re.fullmatch('[a-z][a-z0-9_]{0,62}', c['name']) or c['type'] not in TYPES for c in columns): raise ValueError('Use supported SQL types and lowercase SQL column names in the schema.')
            if len({c['name'] for c in columns}) != len(columns): raise ValueError('Column names must be unique.')
        allowed = [{'text','boolean','bigint','numeric'} for _ in headers]; seen = [False] * len(headers); preview = []; count = 0; max_row_bytes = 0
        for values in rows(reader, len(headers), path.suffix.lower()=='.json'):
            count += 1
            if len(preview) < 5: preview.append(values)
            max_row_bytes = max(max_row_bytes, len(encoded(values)))
            for index, value in enumerate(values):
                allowed[index] &= candidates(value); seen[index] |= value is not None
                if columns:
                    try: validate_cell(value, columns[index])
                    except (ValueError, InvalidOperation) as error: raise ValueError(f'Row {count}, column {headers[index]}: {error}. Convert the source copy or revise its schema before uploading.') from error
        if columns is None: columns = [{'name':name,'type':next((k for k in ('boolean','bigint','numeric') if seen[i] and k in allowed[i]), 'text'),'description':headers[i]} for i,name in enumerate(names(headers))]
        if max_row_bytes + len(encoded(columns)) + 4096 > LIMIT: raise ValueError('A row or its column descriptions exceed the daemon request size. Shorten descriptions or reshape oversized values before import.')
    if fingerprint(path) != digest: raise ValueError('The file changed during inspection. Inspect a stable copy.')
    return {'file':str(path),'sha256':digest,'selectedSheet':selected,'worksheets':sheets,'sourceHeaders':headers,'columns':columns,'rowCount':count,'previewRows':preview}

def function(operation, params):
    result = request({'operation':'action.function','asset_path':'recruitment/api/user-tables/'+operation,'params':params})
    if result.get('ok') is not True: raise RuntimeError(str(result.get('error') or result.get('data') or 'Import API failed'))
    return result['data']

def save_receipt(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    with os.fdopen(os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as handle: json.dump(value, handle, indent=2)
    os.replace(temporary, path)

def upload_file(path, name, description='', sheet=None, encoding='utf-8-sig', schema=None, receipt=None):
    plan = inspect_file(path, sheet, encoding, schema)
    if not re.fullmatch('[a-z][a-z0-9_]{0,62}', name): raise ValueError('Use a lowercase table name starting with a letter, up to 63 characters.')
    receipt = receipt or Path(os.environ.get('RECRUITMENT_HOME', str(Path.home()/'.local/share/recruitment-superpower')))/'imports'/(uuid4().hex+'.json')
    definition={'name':name,'description':description,'columns':plan['columns']}
    namespace=function('namespace',{});owner=namespace['ownerId']
    if receipt.exists():
        state=json.loads(receipt.read_text())
        if state.get('ownerId')!=owner:raise ValueError('This receipt belongs to another account. Sign in to the original account before retrying.')
        if not state.get('importKey'):raise ValueError('This is a legacy non-idempotent import receipt. Inspect its actual table before further writes.')
        if state['sha256']!=plan['sha256'] or state['definition']!=definition:raise ValueError('The receipt belongs to different data or a different schema. Keep the original file and import definition for a retry.')
    else:
        state={'status':'beginning','ownerId':owner,'importKey':str(uuid4()),'file':str(path),'sha256':plan['sha256'],'sourceName':path.name,'sheet':plan['selectedSheet'],'name':name,'expectedRows':plan['rowCount'],'committedRows':0,'inFlight':None,'definition':definition}
    save_receipt(receipt,state)
    try:
        saved=function('import-begin',{**definition,'importKey':state['importKey'],'expectedRows':plan['rowCount'],'sourceName':state['sourceName'],'sourceSha256':plan['sha256']})
        state.update(table=saved,status=saved['status']);save_receipt(receipt,state)
        index=0
        def send(batch):
            nonlocal index
            state.update(status='uploading',inFlight={'index':index,'rows':len(batch)});save_receipt(receipt,state)
            response=function('import-batch',{'id':saved['id'],'index':index,'rows':batch})
            if response['insertedRows']!=len(batch):raise RuntimeError('Unexpected batch receipt. Retry with this same receipt.')
            state.update(committedRows=response['importedRows'],inFlight=None);save_receipt(receipt,state);index+=1
        if saved['status']=='importing':
            with source(path,plan['selectedSheet'],encoding) as (_,reader,_,_,_):
                batch=[];size=0
                for values in rows(reader,len(plan['columns']),path.suffix.lower()=='.json'):
                    row=dict(zip([c['name'] for c in plan['columns']],values));row_size=len(encoded(row))+1
                    if batch and (len(batch)>=500 or size+row_size>LIMIT-4096):send(batch);batch=[];size=0
                    batch.append(row);size+=row_size
                if batch:send(batch)
        if fingerprint(path)!=plan['sha256']:raise RuntimeError('Source changed. Restore the original source before retrying this receipt.')
        result=function('import-complete',{'id':saved['id']})
        if result['importedRows']!=plan['rowCount']:raise RuntimeError('The server row count does not match the source.')
        state.update(status='complete' if result['status']=='ready' else result['status'],committedRows=result['importedRows'],inFlight=None);save_receipt(receipt,state)
        origin=os.environ.get('ATS_WEB_ORIGIN','https://recruitment.zhiyuanwangluo.online').rstrip('/')
        from urllib.parse import quote
        return {**result,'receipt':str(receipt),'semanticsUrl':origin+'/semantics?scope=mine&asset='+quote(result['assetPath'],safe='')+'&tab=data'}
    except Exception:
        state['status']='retryable';save_receipt(receipt,state)
        print('Import stopped. Retry with the same file, schema and --receipt: '+str(receipt),file=sys.stderr)
        raise

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='operation',required=True)
    for operation in ('inspect','upload'):
        command=sub.add_parser(operation);command.add_argument('file',type=Path);command.add_argument('--sheet');command.add_argument('--encoding',default='utf-8-sig');command.add_argument('--schema',type=Path)
        if operation=='upload':command.add_argument('--name',required=True);command.add_argument('--description',default='');command.add_argument('--receipt',type=Path)
    args=parser.parse_args();schema=None
    if args.schema:
        schema=json.loads(args.schema.read_text());schema=schema.get('columns') if isinstance(schema,dict) else schema
    path=args.file.expanduser().absolute()
    if args.operation=='inspect': result=inspect_file(path,args.sheet,args.encoding,schema)
    else:result=upload_file(path,args.name,args.description,args.sheet,args.encoding,schema,args.receipt.expanduser().absolute() if args.receipt else None)
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,csv.Error,KeyError) as error:print('ERROR: '+str(error),file=sys.stderr);raise SystemExit(1)
