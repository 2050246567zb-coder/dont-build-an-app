"""Build a Windows x64 ZIP from tracked source + clean production dependencies.
Run after npm run build and git add. Local data and the unlicensed SDK stay out.
"""
import hashlib, json, os, shutil, subprocess, sys, urllib.request, uuid, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
NODE_VERSION = '24.19.0'
NODE_FILE = f'node-v{NODE_VERSION}-win-x64.zip'
NODE_SHA256 = '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
OUT = ROOT / 'output' / 'release'
STAGE = ROOT / 'tmp' / 'release' / str(uuid.uuid4()) / 'dont-build-an-app'
STAGE.mkdir(parents=True)
OUT.mkdir(parents=True, exist_ok=True)
files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode('utf-8').split('\0')
for name in filter(None, files):
    p = Path(name)
    if p.is_absolute() or '..' in p.parts or any(s in p.parts for s in ('.galgame', 'node_modules', 'tmp', 'output', '.git')):
        raise RuntimeError(f'Unsafe tracked release path: {name}')
    if name.startswith('web/vendor/') or p.name.startswith('.env') or p.suffix in ('.db', '.sqlite', '.log') or p.name == 'runtime-location.json':
        raise RuntimeError(f'Private/runtime file cannot ship: {name}')
    dest = STAGE / p
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / p, dest)
shutil.copytree(ROOT / 'dist', STAGE / 'dist')
cached = ROOT / 'tmp' / NODE_FILE
if not cached.exists():
    print('Downloading official Node.js runtime...', flush=True)
    urllib.request.urlretrieve(f'https://nodejs.org/dist/v{NODE_VERSION}/{NODE_FILE}', cached)
if hashlib.sha256(cached.read_bytes()).hexdigest() != NODE_SHA256:
    raise RuntimeError('Node.js checksum mismatch; refusing to package')
with zipfile.ZipFile(cached) as archive:
    for item in archive.infolist():
        parts = Path(item.filename).parts[1:]
        if not parts or item.is_dir():
            continue
        if '..' in parts:
            raise RuntimeError('Unsafe Node archive path')
        dest = STAGE / 'runtime' / Path(*parts)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(archive.read(item))
env = dict(os.environ, PATH=str(STAGE / 'runtime') + os.pathsep + os.environ['PATH'])
subprocess.run([str(STAGE / 'runtime/node.exe'), str(STAGE / 'runtime/node_modules/npm/bin/npm-cli.js'), 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=STAGE, env=env, check=True)
manifest = {'version': VERSION, 'platform': 'windows-x64', 'nodeVersion': NODE_VERSION, 'nodeArchiveSha256': NODE_SHA256, 'live2dSdkIncluded': False, 'files': {}}
for path in sorted(STAGE.rglob('*')):
    if path.is_file():
        manifest['files'][path.relative_to(STAGE).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
(STAGE / 'release-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
archive_path = OUT / f'dont-build-an-app-v{VERSION}-windows-x64.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(STAGE.rglob('*')):
        if path.is_file():
            archive.write(path, 'dont-build-an-app/' + path.relative_to(STAGE).as_posix())
digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
(OUT / 'SHA256SUMS.txt').write_text(f'{digest}  {archive_path.name}\n', encoding='utf-8')
print(json.dumps({'archive': str(archive_path), 'stage': str(STAGE), 'sha256': digest, 'bytes': archive_path.stat().st_size}, ensure_ascii=False))
