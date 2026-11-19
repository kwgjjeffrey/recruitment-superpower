"""Display records live in ordinary tool stdout and therefore in session history."""
from decimal import Decimal
import json
import os
from uuid import uuid4
from xml.sax.saxutils import escape


def encode(value):
    """Preserve SQL Decimal tokens rather than passing them through a float."""
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError('Display values must be finite JSON numbers.')
        return str(value)
    if isinstance(value, list):
        return '[' + ','.join(encode(item) for item in value) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key, ensure_ascii=False) + ':' + encode(item) for key, item in value.items()) + '}'
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def display_result(action, result):
    # Outside an embedded chat, keep standalone CLI JSON and Python imports
    # compatible. The channel is generic Skill context, not a Codex tool API.
    if not os.environ.get('ATS_PAGE_BRIDGE') or not isinstance(result, dict) or result.get('ok') is not True:
        return
    operation = action.get('operation')
    if operation == 'action.sql':
        record = {'type': 'sql', 'sql': action['sql'], 'data': result['data']}
    elif operation == 'action.page':
        # Reading current state returns complete params too. Only the request
        # identifies whether fields/navigation were supplied for display.
        if not action.get('params') and not action.get('open'):
            return
        record = {'type': 'page', 'data': {key: result[key] for key in ('asset_path', 'section', 'params') if key in result}}
        if 'asset_path' not in record['data'] or not isinstance(record['data'].get('params'), dict):
            return
    else:
        return
    kind = record.pop('type')
    payload = escape(encode(record))
    print(f'<display_to_user version="1" type="{kind}" id="{uuid4().hex}">{payload}</display_to_user>', flush=True)
