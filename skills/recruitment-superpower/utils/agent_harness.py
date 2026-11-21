"""Provider adapters for ATS' private JSONL browser protocol.

Provider runtimes own all conversations. This process holds only connection state;
no transcript, credential, session index or unrelated desktop history is copied.
"""
import asyncio
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import sys
import time
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
ORIGIN = "https://myflicker.corp.kuaishou.com"


def emit(kind, **values):
    print(json.dumps({"type": kind, **values}, ensure_ascii=False), flush=True)


def message(mid, role, content):
    return {"id": str(mid), "role": role, "content": content}


def text_part(text):
    return {"type": "text", "text": str(text)}


def tool_part(tid, name, args, result=None, failed=False):
    part = {"type": "tool-call", "toolCallId": str(tid), "toolName": name or "Agent tool", "args": args or {}, "argsText": json.dumps(args or {}, ensure_ascii=False)}
    if result is not None:
        part.update(result=result, isError=failed)
    return part


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9:_-]{1,128}", value):
        raise ValueError("Invalid conversation ID")
    return value


async def command(args, env=None, timeout=40):
    process = await asyncio.create_subprocess_exec(*map(str, args), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True)
    try:
        out, err = await asyncio.wait_for(process.communicate(), timeout)
        if process.returncode:
            # Provider stderr may contain gateway passwords or authentication URLs.
            # Do not relay it into browser errors or the ATS service log.
            raise RuntimeError("The Agent command failed. Check its local sign-in and runtime health.")
        return out.decode()
    finally:
        if process.returncode is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                await asyncio.wait_for(process.wait(), 3)
            except asyncio.TimeoutError:
                os.killpg(process.pid, signal.SIGKILL)
                await process.wait()


def browser_js(source, tab_id=None):
    if tab_id is not None and not re.fullmatch(r"\d{1,20}", str(tab_id)):
        raise ValueError("Invalid sign-in tab")
    tab_guard = f' and (id of t as text) is "{tab_id}"' if tab_id is not None else ""
    script = f'''tell application "Google Chrome"
repeat with w in windows
repeat with t in tabs of w
if URL of t starts with "{ORIGIN}/"{tab_guard} then
return execute t javascript {json.dumps(source)}
end if
end repeat
end repeat
error "Open MyFlicker in Chrome and sign in."
end tell'''
    return command(["/usr/bin/osascript", "-e", script], timeout=12)


class MyFlicker:
    image_input = False

    def __init__(self, workspace):
        self.workspace = workspace
        self.cli = os.environ.get("ATS_MYFLICKER_CLI") or next((str(p) for p in [Path("/Applications/MyFlicker.app/Contents/Resources/bin/flick")] if p.is_file()), None) or shutil.which("flick")
        self.env = os.environ.copy()
        self.project = None
        self.known = set()
        self.current = None
        self.active = False
        self.stopped = False
        self.mode = "native"

    async def cli_json(self, *args, timeout=45):
        if not self.cli:
            raise RuntimeError("Install MyFlicker Desktop or the flick CLI, then reconnect.")
        try:
            return json.loads(await command([self.cli, *args, "--json"], env=self.env, timeout=timeout))
        except (ValueError, RuntimeError):
            raise RuntimeError("MyFlicker could not complete the request. Check sign-in and daemon health; check the session before repeating a send.") from None

    async def connect(self):
        try:
            groups = await self.cli_json("project", "list", timeout=15)
        except Exception:
            if sys.platform != "darwin" or not self.cli:
                raise
            # Select the transport with a read, before any mutation. Never retry a
            # failed/ambiguous send through another transport.
            await browser_js("location.origin")
            hook = str(HERE / "harness_browser.cjs")
            self.env["NODE_OPTIONS"] = (self.env.get("NODE_OPTIONS", "") + " --require=" + json.dumps(hook)).strip()
            groups = await self.cli_json("project", "list")
            self.mode = "browser"
        self.project = None
        for group in groups:
            if not group.get("isLocal"):
                continue
            for project in group.get("projects", []):
                if any(Path(folder.get("path", "")).absolute() == self.workspace for folder in project.get("folders", [])):
                    self.project = str(project["id"])
        # No registration is needed just to open an empty history list.
        health = await self.cli_json("daemon", "health")
        available = health.get("status") == "healthy"
        ready("myflicker", True, False, available)
        if not available:
            emit("notice", message="MyFlicker runtime is offline. Open MyFlicker, check its network connection, then reconnect. Conversation history remains available.")

    async def list(self):
        if not self.project:
            emit("threads", threads=[])
            return
        rows = await self.cli_json("session", "list", "--project", self.project)
        self.known = {str(row["id"]) for row in rows if str(row.get("projectId")) == self.project}
        emit("threads", threads=[{"id": str(row["id"]), "title": row.get("title") or "New chat"} for row in rows if str(row["id"]) in self.known and row.get("lifecycle") != "deleted"])

    def check(self, sid):
        identifier(sid)
        if sid not in self.known:
            raise ValueError("This ATS conversation could not be found.")

    async def snapshots(self, sid, history=False):
        cursor = None
        seen = set()
        while True:
            args = ["session", "messages", sid, "--oldest", "--pageSize", "100"]
            if cursor:
                args.extend(["--cursor", cursor])
            data = await self.cli_json(*args)
            for row in data.get("messages", []):
                yield row
            if not data.get("hasMore"):
                break
            cursor = data.get("nextPageCursor")
            if not cursor or cursor in seen:
                raise RuntimeError("MyFlicker returned an invalid history cursor.")
            seen.add(cursor)

    async def read(self, sid):
        self.check(sid)
        tools = {}
        async for row in self.snapshots(sid, True):
            entry = flick_message(row, tools)
            if entry:
                emit("historyItem", threadId=sid, message=entry)
        emit("historyDone", threadId=sid)

    async def send(self, action):
        if action.get("images"):
            raise ValueError("MyFlicker does not support image input through this connection.")
        sid = action.get("threadId")
        if sid:
            self.check(sid)
        if not self.project:
            project = await self.cli_json("project", "add", str(self.workspace), "--name", "ATS Assistant")
            self.project = str(project["id"])
        self.active, self.stopped = True, False
        self.current = sid
        # turnConfig.cliEnv is the native runtime's supported environment channel.
        # Retain default permission/sandbox behavior; never request fullaccess.
        cli_env = {key: os.environ[key] for key in ["ATS_PAGE_BRIDGE", "RECRUITMENT_HOME", "RECRUITMENT_SKILL_DIR", "RECRUITMENT_PYTHON"] if key in os.environ}
        # Native project instructions belong in its workspace, never in the
        # user's message/history. Refresh them from the registered Skill entry.
        instruction_file = self.workspace / "AGENTS.md"
        instruction_file.write_text(instructions())
        instruction_file.chmod(0o600)
        args = ["session", "send", action["text"], "--project", self.project, "--permission", "default", "--turn-config", json.dumps({"cliEnv": cli_env})]
        if sid:
            args.extend(["--session", sid])
        result = await self.cli_json(*args, timeout=70)
        sid = identifier(str(result["sessionId"]))
        turn = result["turnId"]
        self.current = sid
        self.known.add(sid)
        emit("thread", id=sid)
        if self.stopped:
            await self.stop()
        seen, tools = {}, {}
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            async for row in self.snapshots(sid):
                if row.get("turnId") != turn or row.get("role") == "user":
                    continue
                entry = flick_message(row, tools)
                if entry and seen.get(entry["id"]) != entry:
                    seen[entry["id"]] = entry
                    emit("message", message=entry)
            meta = await self.cli_json("session", "meta", sid)
            status = flick_turn_status(meta, turn)
            if status == "disconnected":
                # A lost native execution is not a confirmed cancellation or a
                # reason to replay the user's send. Keep history available and
                # require a fresh health check before accepting another turn.
                self.active = False
                ready("myflicker", True, False, False)
                raise RuntimeError("MyFlicker disconnected. Reconnect and read the conversation before sending again.")
            if status in {"completed", "failed", "cancelled", "canceled", "stopped", "interrupted"}:
                # Materialized messages can land just after turn completion.
                async for row in self.snapshots(sid):
                    entry = flick_message(row, tools)
                    if row.get("turnId") == turn and row.get("role") != "user" and entry and seen.get(entry["id"]) != entry:
                        emit("message", message=entry)
                emit("done", status="interrupted" if status in {"cancelled", "canceled", "stopped", "interrupted"} else status)
                self.active = False
                return
            await asyncio.sleep(1)
        raise RuntimeError("MyFlicker is still running. Check the native session before sending again.")

    async def stop(self):
        self.stopped = True
        if self.current:
            await self.cli_json("session", "stop", self.current)

    async def authenticate(self):
        if not self.cli:
            raise RuntimeError("Install MyFlicker Desktop, then reconnect.")
        emit("authenticating")
        output = await command([self.cli, "login", "--print-url"], env=self.env)
        urls = re.findall(r"https://sso\.corp\.kuaishou\.com/[^\s]+", output)
        if not urls:
            raise RuntimeError("MyFlicker did not return its sign-in page.")
        if sys.platform != "darwin":
            raise RuntimeError("Run flick login in your terminal, then reconnect.")
        # Track this flow's tab. An older code page or an unrelated workbench
        # tab must never provide the response for a fresh login request.
        tab_id = (await command(["/usr/bin/osascript", "-e", f'''tell application "Google Chrome"
if (count windows) is 0 then make new window
set t to make new tab at end of tabs of front window with properties {{URL:{json.dumps(urls[0])}}}
return id of t
end tell'''])).strip()
        if not re.fullmatch(r"\d{1,20}", tab_id):
            raise RuntimeError("MyFlicker could not open its sign-in tab.")
        # Only the official six-digit CLI response is read, never browser cookies.
        for _ in range(600):
            try:
                body = await browser_js("location.pathname.startsWith('/auth_continue/code')?document.body.innerText:''", tab_id)
                code = re.search(r"(?<!\d)\d{6}(?!\d)", body)
                if code:
                    hook = str(HERE / "harness_browser.cjs")
                    self.env["NODE_OPTIONS"] = "--require=" + json.dumps(hook)
                    await command([self.cli, "login", "--code", code[0]], env=self.env)
                    self.mode = "browser"
                    await self.connect()
                    await self.list()
                    return
            except Exception:
                pass
            await asyncio.sleep(2)
        raise RuntimeError("MyFlicker sign-in expired. Try again.")

    async def close(self):
        # Disconnect never claims a remotely accepted run was cancelled.
        pass


def flick_turn_status(meta, turn):
    session = meta.get("session", {})
    for item in [session.get("lastRunTurn", {}), session.get("lastTurn", {}), meta.get("lastRunTurn", {}), meta.get("currentTurn", {})]:
        if item.get("turnId", item.get("id")) == turn:
            return str(item.get("status", "")).lower()
    return ""


def flick_message(row, tools=None):
    role = row.get("role")
    if role not in {"user", "assistant", "tool"}:
        return None
    content = row.get("content", "")
    context = row.get("context") or {}
    blocks = context.get("content", []) if isinstance(context, dict) else []
    if role == "assistant" and isinstance(blocks, list) and any(part.get("type") in {"reasoning", "thinking", "redacted_thinking", "tool_call", "tool_result"} for part in blocks if isinstance(part, dict)):
        # Materialized content flattens reasoning into plain text. Respect the
        # native typed context instead of exposing it as an assistant answer.
        tools = {} if tools is None else tools
        parts, mid = [], row["id"]
        for part in blocks:
            if not isinstance(part, dict):
                continue
            kind = part.get("type")
            if kind == "text" and part.get("text"):
                parts.append(text_part(part["text"]))
            elif kind in {"tool_call", "tool_result"} and part.get("toolId"):
                state = tools.setdefault(str(part["toolId"]), {"id": row["id"]})
                if kind == "tool_call":
                    args = part.get("arguments") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except ValueError:
                            args = {"input": args}
                    state.update(name=part.get("name"), args=args)
                else:
                    output = part.get("content", [])
                    if isinstance(output, list) and all(isinstance(p, dict) and p.get("type") == "text" for p in output):
                        output = "\n".join(str(p.get("text", "")) for p in output)
                    state.update(result={"output": output}, failed=bool(part.get("isError")))
                mid = state["id"]
                parts.append(tool_part(part["toolId"], state.get("name"), state.get("args"), state.get("result"), state.get("failed", False)))
        return message(mid, role, parts) if parts else None
    if role == "tool":
        extra = row.get("metadata") or row.get("extra") or {}
        if isinstance(extra, str):
            try:
                extra = json.loads(extra)
            except ValueError:
                extra = {}
        tid = row.get("toolCallId") or extra.get("toolCallId") or row["id"]
        return message(row["id"], "assistant", [tool_part(tid, extra.get("toolName") or extra.get("name"), extra.get("args") or {}, {"output": content}, extra.get("isError", False))])
    if role == "user" and isinstance(content, str):
        try:
            structured = json.loads(content)
            if isinstance(structured, dict):
                content = structured.get("text") or structured.get("plainText") or content
            elif isinstance(structured, list):
                content = "\n".join(p.get("text", "") for p in structured if isinstance(p, dict))
        except ValueError:
            pass
    if not isinstance(content, str):
        content = json.dumps(content, ensure_ascii=False)
    return message(row["id"], role, [text_part(content)])


class WorkBuddy:
    def __init__(self, workspace):
        self.workspace = workspace
        self.process = None
        self.pending = {}
        self.serial = 0
        self.known = set()
        self.current = None
        self.history = None
        self.parts = []
        self.entry = None
        self.count = 0
        self.tools = {}
        self.image_input = False
        self.auth_method = "internal"
        self.workers = []

    async def connect(self):
        bundle = Path("/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli")
        executable = os.environ.get("ATS_WORKBUDDY_CLI")
        env = os.environ.copy()
        self.secret = secrets.token_urlsafe(32)
        env["CODEBUDDY_GATEWAY_PASSWORD"] = self.secret
        if executable:
            launch = [executable]
        elif (bundle / "bin/codebuddy").is_file():
            node = shutil.which("node")
            if not node:
                node = "/Applications/WorkBuddy.app/Contents/MacOS/WorkBuddy"
                env["ELECTRON_RUN_AS_NODE"] = "1"
            launch = [node, str(bundle / "bin/codebuddy")]
            env.update(CODEBUDDY_FORCE_LITE_WB_BUNDLE="1", ACC_PRODUCT_CONFIG_PATH=str(bundle / "product.json"), CODEBUDDY_CONFIG_DIR=str(Path.home() / ".workbuddy"))
        else:
            raise RuntimeError("Install WorkBuddy Desktop, then reconnect.")
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            self.port = listener.getsockname()[1]
        args = [*launch, "--serve", "--acp", "--port", str(self.port), "--host", "127.0.0.1", "--auth", "password", "--permission-mode", "dontAsk", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--tools", "", "--allowedTools", "mcp__ats__search_assets,mcp__ats__view_asset,mcp__ats__execute", "--append-system-prompt", instructions()]
        self.process = await asyncio.create_subprocess_exec(*args, cwd=self.workspace, env=env, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, start_new_session=True, limit=40 * 1024 * 1024)
        self.workers = [asyncio.create_task(self.reader()), asyncio.create_task(self.drain_errors())]
        init = await self.rpc("initialize", {"protocolVersion": 1, "clientInfo": {"name": "ats_workspace", "version": "1"}, "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}}, 30)
        self.image_input = init.get("agentCapabilities", {}).get("promptCapabilities", {}).get("image", False)
        methods = init.get("authMethods", [])
        if methods:
            self.auth_method = next((m["id"] for m in methods if m.get("id") == "internal"), methods[0]["id"])
        for _ in range(60):
            try:
                status = await self.http("/api/v1/auth/account/status")
                data = status.get("data", status)
                authenticated = data.get("authenticated", data.get("isAuthenticated", False))
                ready("workbuddy", bool(authenticated), self.image_input)
                return
            except Exception:
                if self.process.returncode is not None:
                    break
                await asyncio.sleep(.25)
        raise RuntimeError("WorkBuddy did not start its authenticated local API.")

    async def drain_errors(self):
        # Drain bounded chunks. Never expose the runtime's random gateway secret.
        while await self.process.stderr.read(8192):
            pass

    async def reader(self):
        try:
            while raw := await self.process.stdout.readline():
                try:
                    event = json.loads(raw)
                except ValueError:
                    continue
                if "method" in event:
                    if "id" in event:
                        # Only explicitly configured typed MCP tools are permitted.
                        await self.write({"jsonrpc": "2.0", "id": event["id"], "result": {"outcome": {"outcome": "cancelled"}}} if event["method"] == "session/request_permission" else {"jsonrpc": "2.0", "id": event["id"], "error": {"code": -32601, "message": "Host operation unavailable"}})
                    elif event["method"] == "session/update":
                        params = event.get("params", {})
                        if params.get("sessionId") == self.current:
                            self.update(params.get("update", {}))
                elif event.get("id") in self.pending:
                    self.pending.pop(event["id"]).set_result(event)
        finally:
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(RuntimeError("WorkBuddy disconnected. Reconnect and read the session before sending again."))
            self.pending.clear()

    async def write(self, payload):
        self.process.stdin.write((json.dumps(payload) + "\n").encode())
        await self.process.stdin.drain()

    async def rpc(self, method, params, timeout=180):
        self.serial += 1
        rid = self.serial
        future = asyncio.get_running_loop().create_future()
        self.pending[rid] = future
        await self.write({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        try:
            event = await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(rid, None)
        if "error" in event:
            raise RuntimeError(str(event["error"].get("message", "WorkBuddy request failed")))
        return event.get("result", {})

    async def http(self, path):
        def get():
            req = urllib.request.Request(f"http://127.0.0.1:{self.port}" + path, headers={"Authorization": "Bearer " + self.secret, "X-CodeBuddy-Request": "1"})
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(req, timeout=8) as response:
                return json.load(response)
        return await asyncio.to_thread(get)

    async def list(self):
        data = await self.http("/api/v1/sessions?cwd=" + urllib.parse.quote(str(self.workspace), safe=""))
        rows = data.get("data", data).get("sessions", [])
        # The provider query is scoped and every returned record is checked again.
        rows = [row for row in rows if Path(row.get("cwd", "")).absolute() == self.workspace]
        self.known = {identifier(row["id"]) for row in rows}
        emit("threads", threads=[{"id": row["id"], "title": row.get("name") or "New chat"} for row in rows])

    def mcp(self):
        env = [{"name": key, "value": os.environ[key]} for key in ["ATS_PAGE_BRIDGE", "RECRUITMENT_HOME", "RECRUITMENT_SKILL_DIR", "RECRUITMENT_PYTHON"] if key in os.environ]
        return [{"name": "ats", "command": sys.executable, "args": [str(HERE / "harness_mcp.py")], "env": env}]

    def reset_messages(self):
        self.entry, self.parts, self.tools = None, [], {}

    async def load(self, sid, history=False):
        identifier(sid)
        if sid not in self.known:
            raise ValueError("This ATS conversation could not be found.")
        self.current, self.history = sid, sid
        self.reset_messages()
        try:
            await self.rpc("session/load", {"cwd": str(self.workspace), "sessionId": sid, "mcpServers": self.mcp()}, 35)
        finally:
            self.history = None
            self.reset_messages()
        if history:
            emit("historyDone", threadId=sid)

    async def read(self, sid):
        await self.load(sid, True)

    def publish(self, entry):
        if self.history:
            emit("historyItem", threadId=self.history, message=entry)
        else:
            emit("message", message=entry)

    def update(self, update):
        kind = update.get("sessionUpdate")
        if kind in {"user_message_chunk", "agent_message_chunk"}:
            role = "user" if kind == "user_message_chunk" else "assistant"
            part = update.get("content", {})
            if not self.entry or self.entry["role"] != role:
                self.count += 1
                self.parts = []
                self.entry = message(f"{self.current}:message:{self.count}", role, self.parts)
            if part.get("type") == "text":
                if self.parts and self.parts[-1].get("type") == "text":
                    self.parts[-1]["text"] += part.get("text", "")
                else:
                    self.parts.append(text_part(part.get("text", "")))
            elif part.get("type") == "image" and part.get("data") and part.get("mimeType") in {"image/png", "image/jpeg", "image/gif", "image/webp"}:
                self.parts.append({"type": "image", "image": f'data:{part["mimeType"]};base64,{part["data"]}'})
            if self.parts and (role != "user" or self.history):
                self.publish(self.entry)
        elif kind in {"tool_call", "tool_call_update"}:
            self.entry = None
            tid = identifier(update["toolCallId"])
            state = self.tools.setdefault(tid, {})
            state.update(update)
            status = state.get("status")
            result = {"output": state.get("rawOutput", state.get("content", []))} if status in {"completed", "failed"} else None
            self.publish(message(tid, "assistant", [tool_part(tid, state.get("title"), state.get("rawInput", {}), result, status == "failed")]))

    async def send(self, action):
        sid = action.get("threadId")
        if sid:
            if sid != self.current:
                await self.load(sid)
            elif sid not in self.known:
                raise ValueError("This ATS conversation could not be found.")
        else:
            result = await self.rpc("session/new", {"cwd": str(self.workspace), "mcpServers": self.mcp()}, 40)
            self.current = identifier(result["sessionId"])
            self.known.add(self.current)
        self.reset_messages()
        emit("thread", id=self.current)
        prompt = [text_part(action["text"])] if action.get("text") else []
        for image in action.get("images", []):
            if not self.image_input:
                raise ValueError("This WorkBuddy runtime does not support images.")
            header, data = image["url"].split(",", 1)
            prompt.append({"type": "image", "mimeType": header[5:].split(";")[0], "data": data})
        result = await self.rpc("session/prompt", {"sessionId": self.current, "prompt": prompt}, 1800)
        reason = result.get("stopReason")
        error = result.get("_meta", {}).get("codebuddy.ai/errorMessage")
        if reason == "refusal" or error:
            if error and "auth" in error.lower():
                ready("workbuddy", False, self.image_input)
            raise RuntimeError(error or "WorkBuddy declined this request.")
        emit("done", status="interrupted" if reason == "cancelled" else "completed")

    async def stop(self):
        if self.current:
            await self.write({"jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": self.current}})

    async def authenticate(self):
        emit("authenticating")
        await self.rpc("authenticate", {"methodId": self.auth_method}, 1800)
        ready("workbuddy", True, self.image_input)
        await self.list()

    async def close(self):
        for task in self.workers:
            task.cancel()
        if self.process and self.process.returncode is None:
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                await asyncio.wait_for(self.process.wait(), 4)
            except asyncio.TimeoutError:
                os.killpg(self.process.pid, signal.SIGKILL)
                await self.process.wait()


def instructions():
    skill = Path(os.environ["RECRUITMENT_SKILL_DIR"])
    return f"You are the ATS assistant. Use the registered Recruitment Superpower Skill at {skill}; do not resolve its registration link. Use the ATS MCP tools for authorized semantic discovery, page state, page actions, API calls and SQL. Read the relevant asset contract before acting. The browser connection identifies the target tab; actions require an explicit asset_path. Native host tools are unavailable in WorkBuddy.\n\n" + (skill / "SKILL.md").read_text()


def ready(agent, authenticated, images, can_send=True):
    emit("ready", agent=agent, authenticated=authenticated, pageBridge=True, imageInput=bool(images), canSend=can_send)


async def main(agent):
    workspace = Path(os.environ["ATS_AGENT_WORKSPACE"]).absolute()
    workspace.mkdir(parents=True, exist_ok=True)
    provider = MyFlicker(workspace) if agent == "myflicker" else WorkBuddy(workspace)
    tasks = set()
    busy = False
    authenticating = False
    operation = asyncio.Lock()

    async def perform(action):
        nonlocal busy, authenticating
        kind = action.get("type")
        try:
            if kind == "authenticate":
                await provider.authenticate()
            elif kind == "stop":
                await provider.stop()
            elif kind == "list":
                await provider.list()
            elif kind in {"send", "read"}:
                async with operation:
                    if kind == "send":
                        await provider.send(action)
                    else:
                        await provider.read(action["threadId"])
        except Exception as error:
            detail = str(error) or "The Agent request timed out. Check the native session before sending again."
            event = {"list": "listError", "read": "historyError", "stop": "stopFailed", "authenticate": "notice"}.get(kind, "error")
            emit(event, message=detail, **({"threadId": action.get("threadId")} if kind == "read" else {}))
            if kind == "authenticate":
                ready(agent, False, provider.image_input)
        finally:
            if kind == "send":
                busy = False
            if kind == "authenticate":
                authenticating = False

    try:
        try:
            await provider.connect()
        except Exception as error:
            ready(agent, False, provider.image_input)
            emit("notice", message=str(error))
        reader = asyncio.StreamReader(limit=40 * 1024 * 1024)
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_running_loop().connect_read_pipe(lambda: protocol, sys.stdin)
        while line := await reader.readline():
            try:
                action = json.loads(line)
            except ValueError:
                continue
            kind = action.get("type")
            if kind == "send":
                if busy:
                    emit("notice", message="A response is already in progress.")
                    continue
                busy = True
            elif kind == "authenticate":
                if authenticating or busy:
                    continue
                authenticating = True
            elif kind == "read" and busy:
                continue
            task = asyncio.create_task(perform(action))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await provider.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
