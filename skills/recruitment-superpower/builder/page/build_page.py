"""Scaffold, compile, publish and verify user-owned precompiled MF pages."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import hashlib
import tarfile
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.parse
import uuid

sys.dont_write_bytecode = True
ENTRY = Path(__file__).absolute().parents[2]
sys.path.insert(0, str(ENTRY))
from utils.runtime_client import request
from page_project import STATE, digest, inspect_build, read, source_digest, source_files, validate_dist, write
from package_page_components import package_components


def call(name, params):
    result = request({'operation': 'action.function', 'asset_path': 'recruitment/api/pages/' + name, 'params': params})
    if not result.get('ok') or not 200 <= result.get('status', 500) < 300:
        raise RuntimeError(result.get('data', result.get('error')))
    return result['data']


def sdk():
    bundled = Path(__file__).parent / 'sdk'
    return bundled if bundled.is_dir() else ENTRY.parents[1] / 'page-runtime/contracts'


def scaffold(directory, name=None, title=None, template='talent'):
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('Choose an empty project directory.')
    name = name or directory.name.lower().replace(' ', '-')
    if not re.fullmatch(r'[a-z0-9_-]{1,64}', name):
        raise ValueError('Use --name with 1–64 lowercase letters, digits, hyphens or underscores.')
    shutil.copytree(Path(__file__).parent / 'templates' / template, directory, dirs_exist_ok=True)
    package = read(directory / 'package.json')
    package['dependencies']['@recruitment/page'] = package_components(directory, sdk())
    package['name'] = name
    package['recruitmentPage'] = {'id': uuid.uuid4().hex, 'name': name}
    write(directory / 'package.json', package)
    lock=read(Path(__file__).parent/'dependencies-lock.json')
    lock['name']=name;lock['packages']['']['name']=name
    archive=package['dependencies']['@recruitment/page']
    archive_file=directory/archive.removeprefix('file:')
    with tarfile.open(archive_file) as bundle:
        component=json.load(bundle.extractfile('package/package.json'))
    pinned=lock['packages']['node_modules/@recruitment/page']
    if pinned.get('dependencies')!=component.get('dependencies'):
        raise ValueError('The Builder dependency graph changed. Refresh its pinned lock before release.')
    lock['packages']['']['dependencies']['@recruitment/page']=archive
    pinned.update(version=component['version'],resolved=archive,integrity='sha512-'+base64.b64encode(hashlib.sha512(archive_file.read_bytes()).digest()).decode())
    write(directory/'package-lock.json',lock)
    if title:
        schema = directory / 'src/page.schema.ts'
        schema.write_text(re.sub(r"display_name:'[^']*'", lambda _: 'display_name:' + json.dumps(title), schema.read_text(), count=1))
    print(json.dumps({'directory': str(directory), 'name': name, 'next': 'Edit src/page.schema.ts and src/page.tsx; then build, publish and verify.'}))


def check(directory):
    # Existing source-copy projects retain their own gates and remain buildable.
    manifest = directory / 'component-sources.json'
    if manifest.is_file():
        for item in read(manifest)['files']:
            if digest((directory / item['target']).read_bytes()) != item['targetSha256']:
                raise ValueError('Review the component source and update its provenance: ' + item['target'])
    subprocess.run(['npm', 'run', 'check'], cwd=directory, env={**os.environ,'NPM_CONFIG_CACHE':str(directory/STATE/'npm-cache')}, check=True)


def update_components(directory):
    package_path = directory / 'package.json'
    package = read(package_path)
    previous = package.get('dependencies', {}).get('@recruitment/page', '')
    if not re.fullmatch(r'file:vendor/recruitment-page-[a-f0-9]{16}\.tgz', previous):
        raise ValueError('This project has no Builder-managed component dependency. Create a new project and port its business files.')
    before = package_path.read_bytes()
    lock = directory / 'package-lock.json'
    lock_before = lock.read_bytes() if lock.is_file() else None
    archives_before = set((directory / 'vendor').glob('recruitment-page-*.tgz'))
    current = package_components(directory, sdk())
    package['dependencies']['@recruitment/page'] = current
    write(package_path, package)
    try:
        subprocess.run(['npm', 'install', '--no-audit', '--no-fund'], cwd=directory, check=True)
    except subprocess.SubprocessError:
        package_path.write_bytes(before)
        if lock_before is not None:
            lock.write_bytes(lock_before)
        else:
            lock.unlink(missing_ok=True)
        generated = directory / current.removeprefix('file:')
        if generated not in archives_before:
            generated.unlink(missing_ok=True)
        raise
    if current != previous:
        (directory / previous.removeprefix('file:')).unlink(missing_ok=True)
    print(json.dumps({'status': 'updated', 'dependency': current, 'businessSource': 'preserved', 'next': 'Check/build and verify the affected workflow before publishing.'}))


def build(directory):
    if os.environ.get('ATS_PAGE_BRIDGE'):
        prepared=request({'operation':'builder.dependencies','directory':str(directory)})
        if not prepared.get('ok'):raise RuntimeError(prepared.get('error',prepared))
    else:
        subprocess.run(['npm', 'ci' if (directory / 'package-lock.json').exists() else 'install', '--no-audit', '--no-fund'], cwd=directory, check=True)
    check(directory)
    fingerprint = source_digest(directory)
    subprocess.run(['npm', 'run', 'build'], cwd=directory, env={**os.environ, 'RECRUITMENT_BUILD_DIGEST': fingerprint[:16], 'NPM_CONFIG_CACHE':str(directory/STATE/'npm-cache')}, check=True)
    if fingerprint != source_digest(directory):
        raise ValueError('Build changed an authored input. Review the change and build again.')
    files, _, remote = validate_dist(directory)
    write(directory / STATE / 'build.json', {'schemaVersion': 1, 'sourceSha256': fingerprint, 'remote': remote, 'files': files})
    print(json.dumps({'status': 'built', 'remote': remote, 'files': len(files), 'bytes': sum(f['size'] for f in files)}))


def publish(directory, name=None, version=None):
    receipt, files, page = inspect_build(directory)
    name = name or read(directory / 'package.json').get('recruitmentPage', {}).get('name')
    if not name:
        raise ValueError('Specify --name for a project created with an older scaffold.')
    version = version or digest(json.dumps(files, sort_keys=True).encode())[:24]
    upload = call('begin', {'name': name, 'version': version, 'page': page, 'files': files})
    if not upload.get('ready'):
        for item in files:
            content = (directory / 'dist' / item['path']).read_bytes()
            for offset in range(0, max(len(content), 1), 48 * 1024):
                call('upload', {'id': upload['id'], 'path': item['path'], 'offset': offset, 'content': base64.b64encode(content[offset:offset + 48 * 1024]).decode()})
    attach_source(directory, upload['id'])
    result = call('activate', {'id': upload['id']})
    write(directory / STATE / 'publication.json', {**result, 'sourceSha256': receipt['sourceSha256'], 'files': files})
    print(json.dumps(result, indent=2))



def attach_source(directory, build_id=None):
    receipt, compiled, _ = inspect_build(directory)
    if build_id is None:
        published=read(directory / STATE / 'publication.json')
        build_id=published['buildId']
    files=source_files(directory)
    snapshot=call('source-begin', {'id':build_id,'sourceSha256':receipt['sourceSha256'],'files':files,'compiledFiles':compiled})
    if not snapshot['ready']:
        for item in files:
            content=(directory/item['path']).read_bytes()
            for offset in range(0,max(1,len(content)),48*1024):
                call('source-upload',{'id':build_id,'path':item['path'],'offset':offset,'content':base64.b64encode(content[offset:offset+48*1024]).decode()})
        call('source-complete',{'id':build_id})
    return {'buildId':build_id,'sourceFiles':len(files),'sourceSha256':receipt['sourceSha256']}


def fork(asset_path, directory, name=None):
    if directory.exists() and any(directory.iterdir()): raise ValueError('Choose an empty project directory.')
    info=call('source',{'asset_path':asset_path})
    name=name or (asset_path.rsplit('/',1)[-1][:45]+'-copy-'+uuid.uuid4().hex[:6])
    if not re.fullmatch(r'[a-z0-9_-]{1,64}',name): raise ValueError('Use a portable lowercase page name.')
    if name==asset_path.rsplit('/',1)[-1]: raise ValueError('A derived page must use a new name.')
    if info['kind']=='reference':
        scaffold(directory,name,template='talent')
        target=directory/'.reference'
    else:
        directory.mkdir(parents=True,exist_ok=True)
        target=directory
    files=info['files']
    if not files or len(files)>1500 or sum(item['size'] for item in files)>50*1024*1024: raise ValueError('Source exceeds the supported project size.')
    seen=set()
    for item in files:
        p=Path(item['path'])
        if p.is_absolute() or '..' in p.parts or any(part.startswith('.') for part in p.parts) or item['path'] in seen: raise ValueError('Invalid source path.')
        seen.add(item['path'])
    def download(item):
        content=bytearray()
        for offset in range(0,max(1,item['size']),48*1024):
            params={'asset_path':asset_path,'path':item['path'],'offset':offset}
            if info.get('buildId'): params['build_id']=info['buildId']
            result=call('source',params)
            block=base64.b64decode(result['content'],validate=True)
            if result['offset']!=offset or result['size']!=item['size'] or len(block)!=min(48*1024,item['size']-offset): raise ValueError('Source changed during download.')
            content.extend(block)
        if len(content)!=item['size'] or digest(content)!=item['sha256']: raise ValueError('Source hash mismatch: '+item['path'])
        out=target/item['path'];out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(content)
    with ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(download,files))
    package=read(directory/'package.json')
    package['name']=name;package['recruitmentPage']={'id':uuid.uuid4().hex,'name':name}
    write(directory/'package.json',package)
    lock=directory/'package-lock.json'
    if lock.exists():
        value=read(lock);value['name']=name
        if '' in value.get('packages',{}):value['packages']['']['name']=name
        write(lock,value)
    write(directory/STATE/'reference.json',{'assetPath':asset_path,'buildId':info.get('buildId'),'version':info['version'],'kind':info['kind']})
    print(json.dumps({'directory':str(directory),'name':name,'sourceAsset':asset_path,'sourceKind':info['kind'],'sourceFiles':len(files),'next':'For platform references, adapt .reference source into src/. Apply the user instruction, then check/build/publish/verify the new page.'}))

def verify(directory, instance=None, browser=False, params=None):
    _, files, _ = inspect_build(directory)
    published = read(directory / STATE / 'publication.json')
    active = next((b for b in call('list', {})['builds'] if b['id'] == published['buildId']), None)
    if not active or not active.get('active'):
        raise ValueError('This publication is not the active build for the authenticated user.')
    if active['files'] != files:
        raise ValueError('The active server file manifest differs from the local build.')
    if active['assetPath'] != published['assetPath']:
        old=published['assetPath'];before=old.split('/');after=active['assetPath'].split('/')
        try:uuid.UUID(before[1])
        except (ValueError,IndexError):raise ValueError('The saved publication belongs to another asset.')
        if len(before)!=4 or len(after)!=4 or before[0]!='users' or after[0]!='users' or before[2:]!=after[2:]:
            raise ValueError('The saved publication belongs to another asset.')
        # Migrate generated receipts only after the authenticated owner, active
        # immutable build ID and every compiled file have matched.
        published.update(assetPath=active['assetPath'],namespace=active['namespace'])
        for key in ('url','workspaceUrl'):
            if isinstance(published.get(key),str):published[key]=published[key].replace('/'+old,'/'+active['assetPath'])
        write(directory / STATE / 'publication.json',published)
    origin = urllib.parse.urlsplit(published['url'])
    if origin.scheme not in ('http', 'https') or (origin.scheme == 'http' and origin.hostname not in ('127.0.0.1', 'localhost')):
        raise ValueError('Static verification requires HTTPS or a loopback test origin.')
    base = f'{origin.scheme}://{origin.netloc}/page-files/{published["buildId"]}/'

    # Match the installer transport on macOS, whose system Python TLS may be older.
    curl = next((str(p) for p in (Path('/opt/homebrew/opt/curl/bin/curl'), Path('/usr/local/opt/curl/bin/curl')) if p.is_file()), 'curl')

    def verify_file(item):
        if os.environ.get('ATS_PAGE_BRIDGE'):
            verified = request({'operation': 'builder.verify-file', 'build_id': published['buildId'], **item})
            if not verified.get('ok') or not verified.get('verified'):
                raise RuntimeError('Static readback failed for ' + item['path'] + ': ' + str(verified.get('error', verified)))
            return
        fetched = subprocess.run([curl, '-q', '--http1.1', '--fail', '--silent', '--show-error',
            '--proto', '=https,http' if origin.scheme == 'http' else '=https',
            '--connect-timeout', '5', '--max-time', '30', '--max-filesize', str(item['size'] + 1),
            base + item['path']], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=32)
        if fetched.returncode:
            raise RuntimeError('Static readback failed for ' + item['path'] + ': ' + fetched.stderr.decode(errors='replace').strip())
        content = fetched.stdout
        if len(content) != item['size'] or digest(content) != item['sha256']:
            raise ValueError('Published static file differs: ' + item['path'])

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(verify_file, files))
    result = {'status': 'static_verified', 'assetPath': published['assetPath'], 'buildId': published['buildId'], 'namespace': active['namespace'], 'checkedFiles': len(files), 'browser': 'not_requested'}
    if instance or browser or params is not None:
        action = {'operation': 'action.page', 'asset_path': published['assetPath'], 'params': params}
        if instance:
            action['instance_id'] = instance
        observed = request(action)
        if not observed.get('ok'):
            raise RuntimeError(observed.get('error', observed))
        if observed.get('buildId') != published['buildId']:
            raise ValueError('The browser has another build loaded. Reload that page and verify again.')
        result.update(status='verified', browser='observed')
        write(directory / STATE / 'verification.json', result)
        print(json.dumps({**result, 'observation': observed}, indent=2))
    else:
        write(directory / STATE / 'verification.json', result)
        print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    for operation in ['new', 'check', 'build', 'publish', 'verify', 'update-components', 'attach-source']:
        p = subs.add_parser(operation)
        p.add_argument('directory', type=Path)
        if operation in ('new', 'publish'): p.add_argument('--name')
        if operation == 'new':
            p.add_argument('--title')
            p.add_argument('--template', choices=['talent', 'report', 'funnel'], default='talent')
        if operation == 'publish': p.add_argument('--version')
        if operation == 'attach-source': p.add_argument('--build-id')
        if operation == 'verify':
            p.add_argument('--instance')
            p.add_argument('--browser', action='store_true', help='Observe through the originating ATS chat tab.')
            p.add_argument('--params', type=json.loads)
    fork_parser=subs.add_parser('fork')
    fork_parser.add_argument('asset_path')
    fork_parser.add_argument('directory',type=Path)
    fork_parser.add_argument('--name')
    subs.add_parser('versions')
    subs.add_parser('instances')
    subs.add_parser('activate').add_argument('build_id')
    args = parser.parse_args()
    directory = args.directory.expanduser().absolute() if hasattr(args, 'directory') else None
    if args.command == 'new': scaffold(directory, args.name, args.title, args.template)
    elif args.command == 'check': check(directory)
    elif args.command == 'update-components': update_components(directory)
    elif args.command == 'build': build(directory)
    elif args.command == 'publish': publish(directory, args.name, args.version)
    elif args.command == 'verify':
        if args.params is not None and not isinstance(args.params, dict): raise ValueError('--params must be a JSON object.')
        verify(directory, args.instance, args.browser, args.params)
    elif args.command == 'attach-source': print(json.dumps(attach_source(directory,args.build_id),indent=2))
    elif args.command == 'fork': fork(args.asset_path,directory,args.name)
    elif args.command == 'instances': print(json.dumps(request({'operation': 'pages.list'}), indent=2))
    else: print(json.dumps(call('list', {}) if args.command == 'versions' else call('activate', {'id': args.build_id}), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
