"""Local MF scaffolding and user-authenticated publishing; usable independently of recruiting workflows."""
import argparse,base64,hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
ENTRY=Path(__file__).absolute().parents[1]
sys.path.insert(0,str(ENTRY))
from utils.runtime_client import request

def call(name,params):
    result=request({'operation':'action.function','asset_path':'recruitment/api/pages/'+name,'params':params})
    if not result.get('ok'): raise RuntimeError(result.get('data',result.get('error')))
    return result['data']

def sdk():
    bundled=Path(__file__).parent/'sdk'
    return bundled if bundled.is_dir() else ENTRY.parents[1]/'page-runtime/contracts'

def scaffold(directory):
    if directory.exists() and any(directory.iterdir()):raise ValueError('Choose an empty project directory.')
    shutil.copytree(Path(__file__).parent/'templates/talent',directory,dirs_exist_ok=True)
    shutil.copytree(sdk(),directory/'src/sdk',ignore=shutil.ignore_patterns('AGENTS.md'),dirs_exist_ok=True)
    print(json.dumps({'directory':str(directory),'next':'Edit src/page.schema.ts and src/page.tsx, then build.'}))

def build(directory):
    for item in json.loads((directory/'component-sources.json').read_text())['files']:
        if hashlib.sha256((directory/item['target']).read_bytes()).hexdigest()!=item['targetSha256']:raise ValueError('Component source changed; review and update its provenance before building: '+item['target'])
    subprocess.run(['npm','ci' if (directory/'package-lock.json').exists() else 'install','--no-audit','--no-fund'],cwd=directory,check=True)
    subprocess.run(['npm','run','build'],cwd=directory,check=True)

def publish(directory,name,version):
    directory=directory/'dist';files=[]
    for source in sorted(directory.rglob('*')):
        if source.is_symlink():raise ValueError('Build files must not be symlinks.')
        if source.is_file() and not any(p.startswith('.') for p in source.relative_to(directory).parts):
            content=source.read_bytes();files.append({'path':source.relative_to(directory).as_posix(),'size':len(content),'sha256':hashlib.sha256(content).hexdigest()})
    page=json.loads((directory/'page.json').read_text())
    version=version or hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()[:24]
    upload=call('begin',{'name':name,'version':version,'page':page,'files':files})
    for item in files:
        content=(directory/item['path']).read_bytes()
        for offset in range(0,max(len(content),1),48*1024):call('upload',{'id':upload['id'],'path':item['path'],'offset':offset,'content':base64.b64encode(content[offset:offset+48*1024]).decode()})
    print(json.dumps(call('activate',{'id':upload['id']}),indent=2))

def main():
    parser=argparse.ArgumentParser(description=__doc__);subs=parser.add_subparsers(dest='command',required=True)
    for operation in ['new','build','publish']:
        p=subs.add_parser(operation);p.add_argument('directory',type=Path)
        if operation=='publish':p.add_argument('--name',required=True);p.add_argument('--version')
    subs.add_parser('versions');subs.add_parser('instances');subs.add_parser('activate').add_argument('build_id')
    args=parser.parse_args()
    if args.command=='new':scaffold(args.directory.expanduser().absolute())
    elif args.command=='build':build(args.directory.expanduser().absolute())
    elif args.command=='publish':publish(args.directory.expanduser().absolute(),args.name,args.version)
    elif args.command=='instances':print(json.dumps(request({'operation':'pages.list'}),indent=2))
    else:print(json.dumps(call('list',{}) if args.command=='versions' else call('activate',{'id':args.build_id}),indent=2))
if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,subprocess.SubprocessError) as error:print('ERROR: '+str(error),file=sys.stderr);raise SystemExit(1)
