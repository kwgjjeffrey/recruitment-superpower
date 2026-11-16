"""Build receipts and precompiled MF artifact validation. No application credentials."""
import hashlib
import json
from pathlib import Path

STATE = '.recruitment'
PROTOCOL = {'protocol': 'recruitment-page', 'version': 1}
SOURCE_SUFFIXES = {'.ts', '.tsx', '.jsx', '.vue', '.svelte'}


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def digest(content):
    return hashlib.sha256(content).hexdigest()


def source_digest(directory):
    excluded = {'node_modules', 'dist', '.git', STATE, '.DS_Store', '__pycache__'}
    files = []
    for source in sorted(directory.rglob('*')):
        relative = source.relative_to(directory)
        if any(part in excluded for part in relative.parts):
            continue
        if source.is_symlink():
            raise ValueError('Build inputs must not be symlinks: ' + str(relative))
        if source.is_file():
            files.append((relative.as_posix(), digest(source.read_bytes())))
    return digest(json.dumps(files, separators=(',', ':')).encode())


def file_manifest(directory):
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError('Run build first; a regular dist directory is required.')
    files = []
    for source in sorted(directory.rglob('*')):
        relative = source.relative_to(directory)
        if source.is_symlink():
            raise ValueError('Build files must not be symlinks: ' + str(relative))
        if source.is_file():
            if '.vite' in relative.parts:
                continue
            if any(part.startswith('.') or part == 'node_modules' for part in relative.parts):
                raise ValueError('Output includes a working/dependency file: ' + str(relative))
            if source.suffix.lower() in SOURCE_SUFFIXES:
                raise ValueError('Publish compiled JavaScript, not source: ' + str(relative))
            content = source.read_bytes()
            files.append({'path': relative.as_posix(), 'size': len(content), 'sha256': digest(content)})
    if not files or len(files) > 150 or sum(f['size'] for f in files) > 20 * 1024 * 1024:
        raise ValueError('The compiled build must fit 20 MiB and 150 files.')
    return files


def validate_dist(directory):
    output = directory / 'dist'
    files = file_manifest(output)
    names = {f['path'] for f in files}
    if not {'mf-manifest.json', 'page.json'} <= names:
        raise ValueError('Build must emit mf-manifest.json and page.json.')
    manifest, page = read(output / 'mf-manifest.json'), read(output / 'page.json')
    metadata = manifest.get('metaData', {})
    entry = metadata.get('remoteEntry', {})
    if entry.get('type') != 'module' or metadata.get('publicPath') != 'auto':
        raise ValueError('MF requires an ES module entry and automatic relative asset paths.')
    remote_entry = entry.get('path', '') + entry.get('name', '')
    if remote_entry not in names or not remote_entry.endswith(('.js', '.mjs')):
        raise ValueError('The compiled remote entry is missing.')
    exposes = manifest.get('exposes', [])
    if not any(e.get('name') == 'Page' for e in exposes):
        raise ValueError('MF must expose ./Page with mount(element, context).')
    for expose in exposes:
        for kind in ['js', 'css']:
            for mode in ['sync', 'async']:
                if any(path not in names for path in expose.get('assets', {}).get(kind, {}).get(mode, [])):
                    raise ValueError('An MF chunk or stylesheet is missing.')
    if page.get('default_view') != 'main' or 'main' not in page.get('views', {}):
        raise ValueError('The page contract must expose the main view.')
    runtime = page.get('runtime')
    if runtime and (any(runtime.get(k) != v for k, v in PROTOCOL.items()) or runtime.get('remote') != manifest.get('name')):
        raise ValueError('The page runtime protocol and MF identity do not match.')
    return files, page, manifest['name']


def inspect_build(directory):
    receipt_path = directory / STATE / 'build.json'
    if not receipt_path.is_file():
        raise ValueError('Run the Builder build command before publishing.')
    receipt = read(receipt_path)
    files, page, remote = validate_dist(directory)
    if receipt.get('sourceSha256') != source_digest(directory):
        raise ValueError('Source changed after compilation. Run build again.')
    if receipt.get('files') != files or receipt.get('remote') != remote:
        raise ValueError('Compiled output changed after build. Run build again.')
    return receipt, files, page
