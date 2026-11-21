"""Typed ATS MCP tools for harnesses without the Codex file-channel sandbox.

No shell, host file access, token forwarding or second application identity.
The existing private Skill channel and broker validate every operation.
"""
import json
import contextlib
import io
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import _ipc
from utils.display_to_user import display_result, encode

TOOLS = [
    {"name": "search_assets", "description": "Search authorized ATS semantic assets.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}},
    {"name": "view_asset", "description": "Read an authorized semantic asset definition before invoking it.", "inputSchema": {"type": "object", "properties": {"asset_path": {"type": "string"}}, "required": ["asset_path"], "additionalProperties": False}},
    {"name": "execute", "description": "Execute an ATS Skill operation using its published definition. The broker enforces the signed-in user's permissions. Page actions require an explicit asset_path; read page state with params:null, open:false. API calls require their published function asset_path and params. SQL requires operation action.sql and sql. Never guess a contract.", "inputSchema": {"type": "object", "properties": {"action": {"type": "object", "properties": {"operation": {"type": "string", "enum": ["runtime.ping", "pages.list", "semantics.search", "semantics.view", "action.page", "action.function", "action.sql"]}}, "required": ["operation"]}}, "required": ["action"], "additionalProperties": False}},
]


def execute(name, args):
    if name == "search_assets":
        action = {"operation": "semantics.search", "query": args["query"]}
    elif name == "view_asset":
        action = {"operation": "semantics.view", "asset_path": args["asset_path"]}
    elif name == "execute":
        action = args["action"]
    else:
        raise ValueError("Unknown ATS tool")
    allowed = TOOLS[2]["inputSchema"]["properties"]["action"]["properties"]["operation"]["enum"]
    if action.get("operation") not in allowed:
        raise ValueError("Unsupported ATS operation")
    # Deliberately no runtime_client network fallback: a lost browser connection
    # cannot turn a scoped chat tool into an unscoped host invocation.
    result = _ipc(os.environ["ATS_PAGE_BRIDGE"], action)
    records = io.StringIO()
    with contextlib.redirect_stdout(records):
        display_result(action, result)
    # SQL decimals and display records use the same native encoder as the Skill;
    # MCP JSON wraps text, so precise numeric tokens never pass through a float.
    return {"content": [{"type": "text", "text": encode(result) + ("\n" + records.getvalue() if records.getvalue() else "")}], "isError": result.get("ok") is False}


def main():
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if "id" not in request:
                continue
            method = request.get("method")
            if method == "initialize":
                result = {"protocolVersion": request.get("params", {}).get("protocolVersion", "2024-11-05"), "capabilities": {"tools": {}}, "serverInfo": {"name": "ats", "version": "1"}}
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": TOOLS}
            elif method == "tools/call":
                try:
                    result = execute(request["params"]["name"], request["params"].get("arguments", {}))
                except Exception as error:
                    result = {"content": [{"type": "text", "text": str(error)}], "isError": True}
            else:
                print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "error": {"code": -32601, "message": "Method not found"}}), flush=True)
                continue
            print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
        except (ValueError, KeyError):
            continue


if __name__ == "__main__":
    main()
