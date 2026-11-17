"""Install and manage the Recruitment Superpower Skill and Rust runtime."""

PUBLIC_KEY = b'-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA3+J0l3OLOhMew33ZU8pk\nMfaTTx/PoquX3mdgnLJV8UN7Mi9lr8QF6m2bY52fdaFvK4u+SV5VBOgLHsV2AcXl\naWaCgZFC/bzLwBNXy8ZajT/YZQXI6+kaJOotZI3tda5z0gHjMrLS3PlM27hP+P/L\n/xDiB9rI52b6VGWqxO7YyjmvYMbWKxgVUCJPMeHQZiX8FOFqNwHF9RL/vTxTa7sb\nCLa5iz5fbnM9qhRG0KqekVmZj7emP+0tH2lqtblNSn4AcRSqg/51cxQ92kD028Hi\nvkc6HElhjwm1xezznn8ciaLMcCfvuYACqF6Kn8VfO1zbQ11lTBDI0fYzR1S2jCfm\nJgkrZPbNXNGBasgaM8aAeAchiXSGdkIeHoBzQqGK2GndNlR5TeqAJzEQE529+WcV\n4dIRrhr9qaI+0i+2FWQ4sfsYPr4hWMLq6MwCgjbv97vwXdA0IBNwNzlHeZNSjOIy\ntow0G2UXQsEfv0JGdROdKb8l1ZDkGdY/iE2xVsHXrlJtAgMBAAE=\n-----END PUBLIC KEY-----\n'

import argparse
import base64
import contextlib
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

NAME = "recruitment-superpower"
RELEASE_BASE = "https://recruitment.zhiyuanwangluo.online/downloads/recruitment-superpower"
GITHUB_RELEASES = "https://github.com/kwgjjeffrey/recruitment-superpower/releases/"
DEFAULT_ORIGIN = "https://recruitment.zhiyuanwangluo.online"
VERSION = re.compile(r"\d+\.\d+\.\d+\Z")
MAX_DOWNLOAD = 64 * 1024 * 1024


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid4().hex)
    try:
        with temporary.open("x", encoding="utf-8") as output:
            json.dump(value, output, indent=2)
            output.write("\n")
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def atomic_link(path, destination):
    temporary = path.with_name(path.name + "." + uuid4().hex)
    try:
        temporary.symlink_to(destination, target_is_directory=True)
        os.replace(temporary, path)
    finally:
        if temporary.is_symlink():
            temporary.unlink()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("The release URL redirected. Use its canonical HTTPS address.")


def release_mirror(url):
    """Map only known release files to the same publisher's official immutable mirror.

    Mirror bytes still pass the existing pinned signature and component hash checks.
    No application credentials are sent to either distribution endpoint.
    """
    relative = url[len(RELEASE_BASE) + 1:]
    if relative in ('stable.json', 'installer.py', 'install.sh'):
        filename = 'manifest.json' if relative == 'stable.json' else relative
        return GITHUB_RELEASES + 'latest/download/' + filename
    match = re.fullmatch(r'versions/(\d+\.\d+\.\d+)/([A-Za-z0-9._-]+)', relative)
    if match:
        return GITHUB_RELEASES + 'download/v' + match[1] + '/' + match[2]
    return None


def download(url, limit=MAX_DOWNLOAD, timeout=60):
    address = urllib.parse.urlsplit(url)
    if address.scheme != "https" or address.netloc != urllib.parse.urlsplit(RELEASE_BASE).netloc:
        raise ValueError("Release downloads must use the configured HTTPS host.")
    if not address.path.startswith(urllib.parse.urlsplit(RELEASE_BASE).path + "/"):
        raise ValueError("Release downloads must stay within the configured release directory.")
    # Stock macOS curl may have an older TLS backend. Prefer a modern installed curl
    # when present, but never require Homebrew; the signed GitHub mirror works with stock curl.
    curl = next((str(path) for path in (Path('/opt/homebrew/opt/curl/bin/curl'), Path('/usr/local/opt/curl/bin/curl'))
                 if path.is_file()), 'curl')
    mirror = release_mirror(url)
    for attempt in range(3):
        source = mirror if mirror and attempt > 0 else url
        fetched = subprocess.run([
            curl, "-q", "--http1.1", "--fail", "--silent", "--show-error", "--proto", "=https",
            *(["--location", "--max-redirs", "4", "--proto-redir", "=https"] if source == mirror else []),
            "--connect-timeout", "5", "--max-time", str(timeout), "--max-filesize", str(limit),
            "--user-agent", "RecruitmentSuperpower/1.0", source,
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout + 2)
        if not fetched.returncode:
            break
        if fetched.returncode not in (7, 18, 22, 28, 35, 52, 56, 60, 92) or attempt == 2:
            raise ValueError("Could not download the release over HTTPS: " +
                             fetched.stderr.decode(errors="replace").strip())
        if timeout <= 3:
            raise ValueError("The update check timed out.")
        print("Release download interrupted. Retrying with the publisher's verified release mirror…" if mirror
              else "Download interrupted. Retrying…", file=sys.stderr, flush=True)
        time.sleep(1)
    content = fetched.stdout
    if len(content) > limit:
        raise ValueError("The release download exceeds the size limit.")
    return content


def verified_manifest(url, timeout=12):
    envelope = json.loads(download(url, 256 * 1024, timeout=timeout))
    payload = base64.b64decode(envelope["payload"], validate=True)
    signature = base64.b64decode(envelope["signature"], validate=True)
    with tempfile.TemporaryDirectory(prefix="recruitment-signature-") as directory:
        root = Path(directory)
        (root / "key.pem").write_bytes(PUBLIC_KEY)
        (root / "payload").write_bytes(payload)
        (root / "signature").write_bytes(signature)
        verified = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(root / "key.pem"),
             "-signature", str(root / "signature"), str(root / "payload")],
            capture_output=True, timeout=10,
        )
    if verified.returncode:
        raise ValueError("The release manifest publisher signature is invalid.")
    manifest = json.loads(payload)
    if manifest.get("schemaVersion") != 1 or manifest.get("package") != NAME:
        raise ValueError("The release manifest has an unsupported identity.")
    if not re.fullmatch(r"[a-f0-9]{40}", manifest.get("sourceCommit", "")):
        raise ValueError("The release manifest has no immutable source commit.")
    for name in ("skill", "runtime"):
        if not VERSION.fullmatch(manifest["components"][name]["version"]):
            raise ValueError("Invalid component version.")
    return manifest, hashlib.sha256(payload).hexdigest()


def target_platform():
    system = platform.system()
    machine = platform.machine().lower()
    arch = {"aarch64": "arm64", "arm64": "arm64", "amd64": "x86_64", "x86_64": "x86_64"}.get(machine)
    os_name = {"Darwin": "darwin", "Linux": "linux"}.get(system)
    if not arch or not os_name:
        raise ValueError(f"No released runtime for {system} {machine}.")
    return os_name + "-" + arch


def extract_package(content, destination):
    with tarfile.open(fileobj=io.BytesIO(content), mode="r:gz") as archive:
        members = archive.getmembers()
        total = 0
        names = set()
        for entry in members:
            parts = entry.name.split("/")
            if (not parts or parts[0] != "package" or any(p in ("", ".", "..") for p in parts)
                    or "\\" in entry.name or entry.name in names
                    or not (entry.isfile() or entry.isdir())):
                raise ValueError("The package contains an unsafe archive entry.")
            total += entry.size
            if len(members) > 2000 or total > 256 * 1024 * 1024:
                raise ValueError("The expanded package exceeds the size limit.")
            names.add(entry.name)
        for entry in members:
            output = destination.joinpath(*entry.name.split("/")[1:])
            if entry.isdir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(entry) as source, output.open("xb") as sink:
                    shutil.copyfileobj(source, sink)
                output.chmod(0o755 if entry.mode & 0o111 else 0o644)


def required_skill_files(version):
    files = ["SKILL.md", "setup.sh", "action/invoke_a_page.py", "setup/scripts/manage_skill_installation.py"]
    if tuple(map(int, version.split('.'))) >= (0, 2, 0):
        files += ["utils/runtime_client.py", "action/call_a_function.py", "action/run_sql.py"]
    return files


def ensure_component(home, kind, version, artifact, target):
    destination = home / "packages" / kind / version / target
    if destination.exists():
        recorded=destination / ".artifact.json"
        if not recorded.is_file() or any(read_json(recorded).get(key)!=artifact.get(key) for key in ("size", "sha256")):
            raise ValueError("An existing immutable component has a different artifact identity.")
        required=destination / ("ats-daemon" if kind=="runtime" else "SKILL.md")
        healthy = required.is_file()
        if healthy and kind == "runtime":
            try:
                check = subprocess.run([str(required), "--version"], capture_output=True, text=True, timeout=10)
                healthy = check.returncode == 0 and check.stdout.strip() == f"recruitment-daemon {version}"
            except (OSError, subprocess.SubprocessError):
                healthy = False
        elif healthy:
            healthy = all((destination / name).is_file() for name in required_skill_files(version))
        if healthy:
            return destination
        # Preserve a damaged managed package for diagnosis; install a verified replacement.
        quarantine=home / "cache" / "damaged"
        quarantine.mkdir(parents=True,exist_ok=True)
        os.replace(destination,quarantine / (kind+"-"+version+"-"+uuid4().hex))
    print(f"Downloading {kind} {version} ({artifact['size'] / 1024:.0f} KiB)…", flush=True)
    content = download(artifact["url"])
    if len(content) != artifact["size"] or hashlib.sha256(content).hexdigest() != artifact["sha256"]:
        raise ValueError(f"The downloaded {kind} size or checksum is invalid.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".staged-", dir=destination.parent) as temporary:
        staged = Path(temporary) / "package"
        staged.mkdir()
        extract_package(content, staged)
        atomic_json(staged / ".artifact.json", artifact)
        if kind == "runtime":
            result = subprocess.run([str(staged / "ats-daemon"), "--version"],
                                    capture_output=True, text=True, timeout=10)
            if result.returncode or result.stdout.strip() != f"recruitment-daemon {version}":
                raise ValueError("The downloaded runtime did not pass its executable version check.")
        else:
            metadata = read_json(staged / "skill-project.json")
            if metadata["name"] != NAME or metadata["version"] != version:
                raise ValueError("The downloaded Skill identity does not match the release.")
            for required in required_skill_files(version):
                if not (staged / required).is_file():
                    raise ValueError("The downloaded Skill is incomplete.")
        os.replace(staged, destination)
    return destination


def installed_receipt(home):
    current = home / "current"
    if not current.exists():
        return None
    if not current.is_symlink() or current.resolve().parent != (home / "releases").resolve():
        raise ValueError("The current installation is not managed by Recruitment Superpower.")
    return read_json(current / "receipt.json")


def npx_managed_skill(target):
    """Recognize the registered npx entry; never adopt an arbitrary directory.

    npx owns this directory and its updates. The signed installer owns only the
    separate immutable runtime store and must not replace the npx registration.
    """
    if target.is_symlink() or not target.is_dir():
        return False
    try:
        record = read_json(target.parents[1] / '.skill-lock.json')['skills'][NAME]
        metadata = read_json(target / 'skill-project.json')
        return (record.get('sourceType') == 'github'
                and record.get('source') == 'kwgjjeffrey/recruitment-superpower'
                and record.get('skillPath') == 'skills/recruitment-superpower/SKILL.md'
                and metadata.get('name') == NAME)
    except (OSError, ValueError, KeyError, IndexError):
        return False


def register_skill(home, target):
    expected = home / "current/skill"
    if target.is_symlink():
        if target.readlink() != expected:
            raise ValueError(f"Another Skill link already exists at {target}.")
    elif target.exists():
        if not npx_managed_skill(target):
            raise ValueError(f"An unmanaged Skill directory already exists at {target}.")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(expected, target_is_directory=True)


def migrate_legacy_link(home, target, settings):
    legacy = target.parent / "ats-workspace"
    if not legacy.is_symlink():
        return
    source = legacy.readlink()
    suffix = Path(".agents/skills/ats-workspace")
    if not source.is_absolute() or tuple(source.parts[-3:]) != suffix.parts:
        return
    root = source.parents[2]
    if (root / "daemon/artifacts").is_dir():
        settings["legacyRoots"] = list(dict.fromkeys(
            settings.get("legacyRoots", []) + [str(root), str(root / "daemon/artifacts")]))
    backup = target.parent / ".ats-workspace-before-recruitment-superpower"
    if not backup.exists() and not backup.is_symlink():
        legacy.rename(backup)


def install(home, target, manifest_url, origin, port):
    home.mkdir(parents=True, exist_ok=True)
    home.chmod(0o700)
    with (home / ".installation.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ValueError("Another Recruitment Superpower installation is in progress.") from error
        prior = installed_receipt(home)
        manifest, identity = verified_manifest(manifest_url)
        components = manifest["components"]
        architecture = target_platform()
        try:
            runtime_artifact = components["runtime"]["artifacts"][architecture]
        except KeyError as error:
            raise ValueError(f"This release has no runtime for {architecture}.") from error
        if prior:
            for name in ("skill", "runtime"):
                old = tuple(map(int, prior["componentVersions"][name].split(".")))
                new = tuple(map(int, components[name]["version"].split(".")))
                if new < old:
                    raise ValueError("The channel advertises an older component. Use rollback explicitly.")
        runtime = ensure_component(home, "runtime", components["runtime"]["version"], runtime_artifact, architecture)
        skill = ensure_component(home, "skill", components["skill"]["version"], components["skill"]["artifact"], "any")
        activation = home / "releases" / identity
        settings_path = home / "settings.json"
        settings = read_json(settings_path) if settings_path.exists() else {}
        settings.update(origin=origin, port=port, channel=manifest_url, skillTarget=str(target),
                        lastCheckedAt=time.time(), availableVersions={name: components[name]["version"] for name in ("skill", "runtime")})
        migrate_legacy_link(home, target, settings)
        npx_owned = npx_managed_skill(target)
        if target.exists() or target.is_symlink():
            if npx_owned:
                if read_json(target / 'skill-project.json')['version'] != components['skill']['version']:
                    raise ValueError('Update the registered Skill with npx skills update recruitment-superpower --global --yes, then retry runtime setup.')
            elif not target.is_symlink() or target.readlink() != home / "current/skill":
                raise ValueError(f"Another Skill installation exists at {target}.")
        settings['skillManager'] = 'npx-skills' if npx_owned else 'signed-bundle'
        activation.parent.mkdir(parents=True, exist_ok=True)
        required_skill_files = [file.relative_to(skill) for file in skill.rglob('*') if file.is_file()]
        repair_activation = activation.exists() and any(not (activation / 'skill' / file).is_file() for file in required_skill_files)
        native_picker = runtime / 'Recruitment Path Picker.app'
        if activation.exists() and native_picker.is_dir():
            repair_activation = repair_activation or not (activation / 'skill/local-runtime/bin/Recruitment Path Picker.app/Contents/MacOS/ats-daemon').is_file()
        if not activation.exists() or repair_activation:
            with tempfile.TemporaryDirectory(prefix=".activation-", dir=activation.parent) as temporary:
                staged = Path(temporary) / "release"
                staged.mkdir()
                shutil.copytree(skill, staged / "skill")
                binary = staged / "skill/local-runtime/bin/ats-daemon"
                binary.parent.mkdir(parents=True)
                binary.symlink_to(runtime / "ats-daemon")
                if native_picker.is_dir():
                    (binary.parent / native_picker.name).symlink_to(native_picker, target_is_directory=True)
                previous = prior.get('previous') if repair_activation and prior else str((home / "current").resolve()) if prior else None
                receipt = {
                    "name": NAME, "manifestSha256": identity, "manifestUrl": manifest_url,
                    "sourceCommit": manifest["sourceCommit"],
                    "componentVersions": {name: components[name]["version"] for name in ("skill", "runtime")},
                    "previous": previous,
                }
                atomic_json(staged / "receipt.json", receipt)
                damaged = None
                if repair_activation:
                    damaged=home / 'cache/damaged' / ('activation-'+identity+'-'+uuid4().hex)
                    damaged.parent.mkdir(parents=True,exist_ok=True)
                    os.replace(activation,damaged)
                try:
                    os.replace(staged, activation)
                except OSError:
                    if damaged: os.replace(damaged,activation)
                    raise
        previous = (home / "current").resolve() if prior else None
        try:
            register_skill(home, target)
            atomic_link(home / "current", activation)
            atomic_json(settings_path, settings)
        except OSError:
            if previous:
                atomic_link(home / "current", previous)
            elif (home / "current").is_symlink():
                (home / "current").unlink()
            raise
    return installed_receipt(home)


def probe(origin, port):
    request = urllib.request.Request(f"http://127.0.0.1:{port}/api/status", headers={"Origin": origin})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=2) as response:
            if response.read(1024) != b"ats-daemon/1":
                return "conflict"
            return "running"
    except urllib.error.HTTPError as error:
        if error.code == 403 and error.read(1024) == b"ats-daemon/1":
            return "wrong_origin"
        return "conflict"
    except urllib.error.URLError as error:
        if isinstance(error.reason, ConnectionRefusedError):
            return "stopped"
        return "conflict"
    except OSError:
        # A listener shutting down can reset the probe before refusing new connections.
        return "conflict"


def open_page(origin):
    command = ["open"] if platform.system() == "Darwin" else ["xdg-open"]
    subprocess.run(command + [origin + "/talent"], check=True, timeout=15)


def matching_runtime(home, origin, port):
    discovery = home / "runtime.json"
    if not discovery.is_file():
        raise ValueError("The port belongs to another or unmanaged runtime installation. No process was stopped.")
    request = urllib.request.Request(f"http://127.0.0.1:{port}/api/runtime", headers={"Origin": origin})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=2) as response:
        actual = json.loads(response.read(8192))
    if actual != read_json(discovery) or actual.get("service") != NAME:
        raise ValueError("The listening process does not match this installation's discovery record. No process was stopped.")
    return actual


def managed_runtime(home):
    discovery = home / "runtime.json"
    if not discovery.is_file():
        return None
    saved = read_json(discovery)
    if probe(saved["origin"], saved["port"]) == "stopped":
        return None
    return matching_runtime(home, saved["origin"], saved["port"])


def start(home, settings, no_open, background=True, force=False):
    origin, port = settings["origin"], settings["port"]
    with (home / ".startup.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # Agent commands use the registered entry, never the immutable package path.
        # Preserve its lexical path: resolve() would bypass the Skill registration.
        skill_entry = Path(settings.get("skillTarget", str(Path.home() / ".agents/skills" / NAME))).expanduser().absolute()
        register_skill(home, skill_entry)
        state = probe(origin, port)
        running = managed_runtime(home)
        versions = installed_receipt(home)["componentVersions"]
        if running:
            if not force and running["origin"] == origin and running["port"] == port and running.get("runtimeVersion") == versions["runtime"] and running.get("skillVersion") == versions["skill"]:
                print(f"Recruitment runtime is already running on 127.0.0.1:{port}.", flush=True)
                if not no_open: open_page(origin)
                return
            if running["port"] != port and state != "stopped":
                raise ValueError(f"Port {port} is occupied ({state}). The existing runtime was retained.")
            print("Restarting the managed runtime to load selected components or settings…", flush=True)
            stop(home, settings)
            state = probe(origin, port)
        if state != "stopped":
            if shutil.which("lsof"):
                subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"], check=False)
            raise ValueError(f"Port {port} is occupied ({state}). No process was stopped.")
        release = (home / "current").resolve()
        binary = release / "skill/local-runtime/bin/ats-daemon"
        environment = dict(os.environ, RECRUITMENT_HOME=str(home), RECRUITMENT_SKILL_DIR=str(skill_entry),
                           RECRUITMENT_PYTHON=str(Path(sys.executable).resolve()), ATS_WEB_ORIGIN=origin, ATS_DAEMON_PORT=str(port))
        if not no_open: open_page(origin)
        if not background:
            os.execve(binary, [str(binary)], environment)
        log_path = home / "runtime.log"
        with log_path.open("ab") as log:
            log_path.chmod(0o600)
            process = subprocess.Popen([str(binary)], env=environment, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, close_fds=True)
        for _ in range(100):
            if process.poll() is not None:
                raise ValueError(f"Runtime exited during startup. See {log_path}.")
            if probe(origin, port) == "running":
                matching_runtime(home, origin, port)
                print(f"Recruitment runtime started on 127.0.0.1:{port}.", flush=True)
                return
            time.sleep(.1)
        raise ValueError(f"Runtime did not become healthy. See {log_path}.")


def stop(home, settings):
    saved = read_json(home / "runtime.json") if (home / "runtime.json").is_file() else settings
    if probe(saved["origin"], saved["port"]) == "stopped":
        print("Recruitment runtime is already stopped.")
        return
    actual = matching_runtime(home, saved["origin"], saved["port"])
    os.kill(actual["pid"], signal.SIGTERM)
    for _ in range(50):
        if probe(actual["origin"], actual["port"]) == "stopped":
            print("Recruitment runtime stopped.")
            return
        time.sleep(0.1)
    raise ValueError("The runtime did not stop in time.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="start",
                        choices=("install", "start", "status", "check", "upgrade", "rollback", "stop", "restart"))
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("RECRUITMENT_HOME", str(Path.home() / ".local/share" / NAME))))
    parser.add_argument("--target", type=Path)
    parser.add_argument("--origin")
    parser.add_argument("--port", type=int)
    parser.add_argument("--manifest-url")
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--background", action="store_true", help="Start a detached runtime (default).")
    parser.add_argument("--foreground", action="store_true", help="Keep runtime logs in this terminal.")
    args = parser.parse_args()
    home = args.home.expanduser().resolve()
    settings_path = home / "settings.json"
    settings = read_json(settings_path) if settings_path.exists() else {}
    target = (args.target or Path(settings.get("skillTarget", str(Path.home() / ".agents/skills" / NAME)))).expanduser().absolute()
    origin = args.origin or settings.get("origin", DEFAULT_ORIGIN)
    address = urllib.parse.urlsplit(origin)
    if (address.scheme not in ("https", "http") or not address.netloc or address.path
            or address.query or address.fragment or address.username or address.password):
        raise ValueError("Use a web origin without a path, query, credentials or fragment.")
    port = args.port if args.port is not None else settings.get("port", 4184)
    if not 1 <= port <= 65535:
        raise ValueError("The runtime port must be between 1 and 65535.")
    manifest_url = args.manifest_url or settings.get("channel", RELEASE_BASE + "/stable.json")
    receipt = installed_receipt(home)
    wanted = read_json(target / 'skill-project.json').get('componentVersions') if npx_managed_skill(target) else None
    needs_alignment = wanted and (not receipt or receipt['componentVersions'] != wanted)
    if (args.command in ("install", "upgrade") or (not receipt and args.command == "start")
            or (args.command in ("start", "restart") and needs_alignment)):
        receipt = install(home, target, manifest_url, origin, port)
        settings = read_json(settings_path)
    if not receipt:
        raise ValueError("Recruitment Superpower is not installed. Run the published installer.")
    versions = receipt["componentVersions"]
    print(f"Recruitment Superpower skill {versions['skill']} · runtime {versions['runtime']}", flush=True)
    if args.command == "start":
        if time.time() - settings.get("lastCheckedAt", 0) > 3600:
            try:
                available, _ = verified_manifest(manifest_url, timeout=3)
                settings.update(lastCheckedAt=time.time(), availableVersions={
                    name: available["components"][name]["version"] for name in ("skill", "runtime")})
                atomic_json(settings_path, settings)
            except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                print("Update check unavailable. Using the installed components.", file=sys.stderr)
        if any(tuple(map(int, settings.get("availableVersions", versions)[name].split(".")))
               > tuple(map(int, versions[name].split("."))) for name in ("skill", "runtime")):
            print("An update is available. Run setup.sh upgrade to install it.", flush=True)
    if args.command == "check":
        available, _ = verified_manifest(manifest_url)
        print(json.dumps({"installed": versions, "available": {
            name: available["components"][name]["version"] for name in ("skill", "runtime")}}, indent=2))
    elif args.command == "rollback":
        with (home / ".installation.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            previous = receipt.get("previous")
            if not previous or Path(previous).parent != home / "releases":
                raise ValueError("No prior installation is available for rollback.")
            old = read_json(Path(previous) / "receipt.json")
            if old.get("name") != NAME:
                raise ValueError("The prior installation has an invalid identity.")
            atomic_link(home / "current", Path(previous))
            print("Activated previous components. Restart a running runtime to load them.")
    elif args.command == "status":
        print(json.dumps({**receipt, "runtime": probe(origin, port)}, indent=2))
    elif args.command == "stop":
        stop(home, settings)
    elif args.command in ("start", "restart"):
        start(home, dict(settings, origin=origin, port=port), args.no_open, not args.foreground, force=args.command == "restart")
    else:
        print("Components installed. Start or restart the runtime to load this release.")
    if args.command in ("start", "restart"):
        atomic_json(settings_path, dict(settings, origin=origin, port=port))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f"Recruitment Superpower: {error}", file=sys.stderr)
        raise SystemExit(1)
