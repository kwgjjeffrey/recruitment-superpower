"""Shared native client: recover installation/startup, then execute through one daemon protocol."""
import fcntl
from decimal import Decimal
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from uuid import uuid4

HOME = Path(os.environ.get('RECRUITMENT_HOME', str(Path.home()/'.local/share/recruitment-superpower'))).expanduser()


def _settings():
    path = HOME/'settings.json'
    return json.loads(path.read_text()) if path.exists() else {}


def _probe(settings):
    origin = settings.get('origin', os.environ.get('ATS_WEB_ORIGIN', 'https://recruitment.zhiyuanwangluo.online'))
    port = settings.get('port', int(os.environ.get('ATS_DAEMON_PORT', '4184')))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(f'http://127.0.0.1:{port}/api/runtime', headers={'Origin': origin})
    try:
        try:
            response = opener.open(request, timeout=2)
        except urllib.error.HTTPError as error:
            saved = json.loads((HOME/'runtime.json').read_text()) if (HOME/'runtime.json').exists() else {}
            if error.code != 403 or saved.get('port') != port or saved.get('origin') == origin:
                raise
            # A managed daemon may still be running with its previous allowed origin.
            previous = urllib.request.Request(f'http://127.0.0.1:{port}/api/runtime', headers={'Origin': saved['origin']})
            response = opener.open(previous, timeout=2)
        with response:
            info = json.load(response)
        if info.get('service') != 'recruitment-superpower':
            raise RuntimeError(f'Port {port} belongs to another service.')
        saved = HOME/'runtime.json'
        if not saved.exists() or json.loads(saved.read_text()) != info:
            raise RuntimeError(f'Port {port} belongs to a different runtime installation.')
        return info
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Port {port} has a service with a different origin or protocol.') from error
    except (urllib.error.URLError, ConnectionError, TimeoutError):
        return None


def _wanted_versions(settings):
    entry = Path(settings.get('skillTarget', str(Path.home()/'.agents/skills/recruitment-superpower')))
    metadata = entry/'skill-project.json'
    if metadata.is_file():
        versions = json.loads(metadata.read_text()).get('componentVersions')
        if versions:
            return versions
    receipt = HOME/'current/receipt.json'
    return json.loads(receipt.read_text())['componentVersions'] if receipt.is_file() else None


def _selected_runtime(info, settings):
    if not info or info.get('protocolVersion', 1) < 2:
        return False
    if info.get('origin') != settings.get('origin', info.get('origin')) or info.get('port') != settings.get('port', info.get('port')):
        return False
    versions = _wanted_versions(settings)
    if versions:
        return info.get('runtimeVersion')==versions['runtime'] and info.get('skillVersion')==versions['skill']
    return True


def ensure_runtime():
    """Reuse a healthy daemon; serialize repair/start so concurrent CLIs cannot race."""
    HOME.mkdir(parents=True, exist_ok=True)
    with (HOME/'.ensure.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        settings = _settings()
        info = _probe(settings)
        if _selected_runtime(info, settings):
            return info, settings
        # Recovery must use the same registered entry as ordinary Skill commands.
        entry = Path(settings.get('skillTarget', str(Path.home()/'.agents/skills/recruitment-superpower')))
        installer = entry/'setup/scripts/manage_skill_installation.py'
        binary = HOME/'current/skill/local-runtime/bin/ats-daemon'
        receipt = HOME/'current/receipt.json'
        selected = json.loads(receipt.read_text())['componentVersions'] if receipt.is_file() else None
        if not binary.is_file() or selected != _wanted_versions(settings) or (info and info.get("protocolVersion",1)<2):
            print('Installing or repairing the local runtime…', file=sys.stderr, flush=True)
            subprocess.run([sys.executable, str(installer), 'install', '--home', str(HOME)], check=True, stdout=sys.stderr, timeout=240)
        command = 'restart' if info else 'start'
        print('Starting the local runtime…', file=sys.stderr, flush=True)
        try:
            subprocess.run([sys.executable, str(installer), command, '--home', str(HOME), '--no-open', '--background'], check=True, stdout=sys.stderr, timeout=30)
        except subprocess.CalledProcessError:
            # Check cached executable health and restore a damaged managed package once.
            subprocess.run([sys.executable, str(installer), 'install', '--home', str(HOME)], check=True, stdout=sys.stderr, timeout=240)
            subprocess.run([sys.executable, str(installer), 'start', '--home', str(HOME), '--no-open', '--background'], check=True, stdout=sys.stderr, timeout=30)
        settings = _settings()
        info = _probe(settings)
        if not info or info.get('protocolVersion', 1) < 2:
            raise RuntimeError('The installed runtime uses an older protocol. Run setup.sh upgrade, then retry.')
        if not _selected_runtime(info, settings):
            raise RuntimeError('The running daemon does not match the installed Skill. Run setup.sh restart after updating through npx skills.')
        return info, settings


def _alive(channel):
    try:
        context=json.loads((Path(channel)/'context.json').read_text())
        os.kill(context['daemon_pid'],0)
        return True
    except PermissionError:
        return True
    except (OSError, ValueError, KeyError):
        return False


def _ipc(channel, action):
    directory = Path(channel)
    request_id = uuid4().hex
    payload = (json.dumps({'id': request_id, 'action': action}, ensure_ascii=False)+'\n').encode()
    if len(payload)>128*1024:
        raise ValueError('Skill request exceeds 128 KiB. Narrow the request.')
    with (directory/'request').open('r+b') as request, (directory/'reply').open('rb', buffering=0) as response:
        fcntl.flock(request, fcntl.LOCK_EX)
        try:
            request.truncate(0);request.write(payload);request.flush()
            deadline=time.monotonic()+170
            while time.monotonic()<deadline:
                if not _alive(channel):
                    raise ConnectionError("Runtime stopped during the operation")
                response.seek(0);data=response.read(2*1024*1024+1)
                if len(data)>2*1024*1024:
                    raise RuntimeError('Runtime response is too large.')
                if data.endswith(b'\n'):
                    try:
                        reply=json.loads(data, parse_float=Decimal) if action.get('operation') == 'action.sql' else json.loads(data)
                        if reply.get('id')==request_id:
                            return reply['result']
                    except (ValueError,KeyError):
                        pass
                time.sleep(.06)
        finally:
            request.truncate(0)
    raise RuntimeError('The runtime did not respond. Reconnect the application; read page state before retrying a page action.')


def _request(action):
    channel=os.environ.get('ATS_PAGE_BRIDGE')
    context={}
    if channel:
        try:
            context=json.loads((Path(channel)/'context.json').read_text())
        except (OSError,ValueError):
            pass
    interrupted = False
    if channel and (Path(channel)/'request').is_file() and _alive(channel):
        # This transport works inside Codex's network-disabled shell sandbox.
        try:
            return _ipc(channel,action)
        except ConnectionError:
            interrupted = True
    info,settings=ensure_runtime()
    if interrupted and action.get('operation') == 'action.function':
        # The API may have committed before its reply was lost. Never replay an unknown write.
        raise RuntimeError('The runtime restarted during an API operation. Its outcome is unknown; read the actual application state before repeating it.')
    with sqlite3.connect(f'file:{HOME / "runtime.sqlite3"}?mode=ro', uri=True) as database:
        row=database.execute("SELECT value FROM settings WHERE key='local_token'").fetchone()
    if not row:
        raise RuntimeError('Runtime authorization is missing. Run setup.sh restart.')
    origin=settings.get('origin',info['origin'])
    call=urllib.request.Request(f'http://127.0.0.1:{info["port"]}/api/execute',data=json.dumps({'action':action,'tabId':context.get('tab_id'),'userId':context.get('user_id')}).encode(),headers={'Origin':origin,'Authorization':'Bearer '+row[0],'Content-Type':'application/json'},method='POST')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(call,timeout=170) as response:
        return json.load(response, parse_float=Decimal) if action.get('operation') == 'action.sql' else json.load(response)


def request(action):
    if action.get('operation') == 'action.page' and action.get('params') == {} and not action.get('open'):
        action = {**action, 'params': None}
    result = _request(action)
    from utils.display_to_user import display_result
    display_result(action, result)
    return result


def display(action, output='json'):
    try:
        result=request(action)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        result={'ok':False,'error':{'message':str(error)}}
    if output == 'yaml':
        from utils.yaml_output import render
        print(render(result), end='')
    else:
        print(json.dumps(result,ensure_ascii=False))
    return 1 if result.get('ok') is False else 0
