"""Execute read-only semantic SQL: terminal tables, or a pandas DataFrame on import."""
import argparse
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request
from utils.sql_output import format_table


class SqlError(RuntimeError):
    """A failed SQL request; never an empty successful result."""


def _execute(sql):
    if not isinstance(sql, str) or not sql.strip():
        raise SqlError('Supply one nonempty SELECT query.')
    try:
        result = request({'operation': 'action.sql', 'sql': sql})
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        raise SqlError(str(error)) from error
    if not isinstance(result, dict):
        raise SqlError('Invalid SQL service response.')
    if result.get('ok') is not True:
        error = result.get('error') or result.get('data') or {}
        message = error.get('message') if isinstance(error, dict) else str(error)
        raise SqlError(message or 'SQL execution failed.')
    data = result.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('columns'), list) or not isinstance(data.get('rows'), list):
        raise SqlError('The SQL service must be updated to return column metadata.')
    columns, rows = data['columns'], data['rows']
    if any(not isinstance(c, dict) or not isinstance(c.get('name'), str) or not isinstance(c.get('type'), str) for c in columns):
        raise SqlError('Invalid SQL column metadata.')
    if any(not isinstance(row, list) or len(row) != len(columns) for row in rows):
        raise SqlError('Invalid SQL row shape.')
    return data


def _parse_temporal(parse, value):
    if value is None:
        return None
    try:
        return parse(value)
    except ValueError:
        # PostgreSQL infinity and dates outside Python's range remain lossless.
        return value


def _series(pd, values, sql_type):
    sql_type = sql_type.upper()
    if sql_type in ('INT2', 'INT4', 'INT8'):
        return pd.Series(values, dtype='Int64')
    if sql_type in ('FLOAT4', 'FLOAT8'):
        return pd.Series(values, dtype='Float64')
    if sql_type == 'BOOL':
        return pd.Series(values, dtype='boolean')
    if sql_type == 'NUMERIC':
        return pd.Series([None if value is None else Decimal(str(value)) for value in values], dtype=object)
    if sql_type in ('TIMESTAMP', 'TIMESTAMPTZ'):
        try:
            return pd.Series(pd.to_datetime(values, utc=sql_type == 'TIMESTAMPTZ'))
        except (ValueError, OverflowError):
            return pd.Series([_parse_temporal(datetime.fromisoformat, value) for value in values], dtype=object)
    if sql_type in ('DATE', 'TIME', 'TIMETZ'):
        parse = date.fromisoformat if sql_type == 'DATE' else time.fromisoformat
        return pd.Series([_parse_temporal(parse, value) for value in values], dtype=object)
    if sql_type in ('TEXT', 'VARCHAR', 'BPCHAR', 'NAME', 'UUID'):
        return pd.Series(values, dtype='string')
    return pd.Series(values, dtype=object)


def run(sql):
    """Return a complete pandas DataFrame. Failed or truncated queries raise SqlError."""
    try:
        import pandas as pd
    except ImportError as error:
        raise SqlError('Python SQL imports require pandas. Install requirements-analysis.txt with the Python interpreter used for analysis.') from error
    data = _execute(sql)
    if data.get('truncated'):
        raise SqlError(f"The query exceeds the {data.get('limit', 200)}-row limit. Filter or aggregate in SQL; a partial DataFrame was not returned.")
    columns, rows = data['columns'], data['rows']
    series = [_series(pd, [row[index] for row in rows], column['type']) for index, column in enumerate(columns)]
    frame = pd.concat(series, axis=1) if series else pd.DataFrame(index=range(len(rows)))
    frame.columns = [column['name'] for column in columns]
    frame.attrs['sql_types'] = [column['type'] for column in columns]
    return frame


run_sql = run


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sql', help='One SELECT query; table references use quoted asset paths.')
    args = parser.parse_args(argv)
    try:
        data = _execute(args.sql)
        print(format_table(data['columns'], data['rows']))
        if data.get('truncated'):
            print(f"WARNING: Result exceeds the {data.get('limit', 200)}-row limit and is incomplete. Filter or aggregate in SQL.", file=sys.stderr)
            return 2
        return 0
    except SqlError as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
