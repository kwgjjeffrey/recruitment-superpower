"""Package Builder-owned page components/tooling with the canonical page contract."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

MODULE = Path(__file__).absolute().parent


def package_components(directory, sdk):
    files = {}
    for owner, prefix in ((MODULE / 'components', ''), (MODULE / 'tooling', 'tooling/')):
        for source in owner.rglob('*'):
            if source.is_file() and source.name != 'AGENTS.md' and '__pycache__' not in source.parts:
                relative = source.relative_to(owner)
                if owner.name == 'components':
                    if relative.as_posix() not in ('package.json', 'component-sources.json') and not (relative.parts[0] == 'src' and source.suffix in ('.ts', '.tsx', '.js', '.css')):
                        continue
                elif len(relative.parts) != 1 or source.suffix not in ('.ts', '.mjs'):
                    continue
                if source.is_symlink():
                    raise ValueError('Builder component sources cannot be symlinks.')
                files[prefix + relative.as_posix()] = source.read_bytes()
    for source in sdk.glob('*.ts'):
        files['src/contracts/' + source.name] = source.read_bytes()
    if 'src/contracts/portable.ts' not in files:
        raise ValueError('The canonical Builder page SDK is incomplete.')
    metadata = json.loads((MODULE.parents[1] / 'skill-project.json').read_text())
    package = json.loads(files['package.json'])
    package['version'] = metadata['version']
    files['package.json'] = (json.dumps(package, indent=2) + '\n').encode()
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', mtime=0, filename='') as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, content in sorted(files.items()):
                info = tarfile.TarInfo('package/' + name)
                info.mode = 0o755 if name.endswith('.mjs') else 0o644
                info.size = len(content)
                archive.addfile(info, io.BytesIO(content))
    content = output.getvalue()
    name = 'recruitment-page-' + hashlib.sha256(content).hexdigest()[:16] + '.tgz'
    destination = directory / 'vendor' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return 'file:vendor/' + name
