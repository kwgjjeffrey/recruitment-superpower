"""Scaffold, compile, publish and verify user-owned precompiled MF pages."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import json
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
from page_project import STATE, digest, inspect_build, read, source_digest, validate_dist, write
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
    subprocess.run(['npm', 'run', 'check'], cwd=directory, check=True)


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
    subprocess.run(['npm', 'ci' if (directory / 'package-lock.json').exists() else 'install', '--no-audit', '--no-fund'], cwd=directory, check=True)
    check(directory)
    fingerprint = source_digest(directory)
    subprocess.run(['npm', 'run', 'build'], cwd=directory, env={**os.environ, 'RECRUITMENT_BUILD_DIGEST': fingerprint[:16]}, check=True)
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
    result = call('activate', {'id': upload['id']})
    write(directory / STATE / 'publication.json', {**result, 'sourceSha256': receipt['sourceSha256'], 'files': files})
    print(json.dumps(result, indent=2))


def verify(directory, instance=None, browser=False, params=None):
    _, files, _ = inspect_build(directory)
    published = read(directory / STATE / 'publication.json')
    active = next((b for b in call('list', {})['builds'] if b['id'] == published['buildId']), None)
    if not active or not active.get('active') or active.get('assetPath') != published['assetPath']:
        raise ValueError('This publication is not the active build for the authenticated user.')
    if active['files'] != files:
        raise ValueError('The active server file manifest differs from the local build.')
    origin = urllib.parse.urlsplit(published['url'])
    if origin.scheme not in ('http', 'https') or (origin.scheme == 'http' and origin.hostname not in ('127.0.0.1', 'localhost')):
        raise ValueError('Static verification requires HTTPS or a loopback test origin.')
    base = f'{origin.scheme}://{origin.netloc}/page-files/{published["buildId"]}/'

    # Match the installer transport on macOS, whose system Python TLS may be older.
    curl = next((str(p) for p in (Path('/opt/homebrew/opt/curl/bin/curl'), Path('/usr/local/opt/curl/bin/curl')) if p.is_file()), 'curl')

    def verify_file(item):
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
    for operation in ['new', 'check', 'build', 'publish', 'verify', 'update-components']:
        p = subs.add_parser(operation)
        p.add_argument('directory', type=Path)
        if operation in ('new', 'publish'): p.add_argument('--name')
        if operation == 'new':
            p.add_argument('--title')
            p.add_argument('--template', choices=['talent', 'report', 'funnel'], default='talent')
        if operation == 'publish': p.add_argument('--version')
        if operation == 'verify':
            p.add_argument('--instance')
            p.add_argument('--browser', action='store_true', help='Observe through the originating ATS chat tab.')
            p.add_argument('--params', type=json.loads)
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
    elif args.command == 'instances': print(json.dumps(request({'operation': 'pages.list'}), indent=2))
    else: print(json.dumps(call('list', {}) if args.command == 'versions' else call('activate', {'id': args.build_id}), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
