"""Dependency-free SQL terminal rendering; protocol metadata never enters stdout."""
from decimal import Decimal
import json
import unicodedata


def _escape(text):
    escapes = {'\n': r'\n', '\r': r'\r', '\t': r'\t'}
    return ''.join(escapes.get(char, f'\\x{ord(char):02x}' if unicodedata.category(char).startswith('C') else char) for char in text)


def _json(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, list):
        return '[' + ', '.join(_json(item) for item in value) + ']'
    if isinstance(value, dict):
        return '{' + ', '.join(json.dumps(key, ensure_ascii=False) + ': ' + _json(item) for key, item in value.items()) + '}'
    return json.dumps(value, ensure_ascii=False)


def _cell(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (dict, list)):
        return _escape(_json(value))
    return _escape(str(value))


def _width(text):
    return sum(0 if unicodedata.combining(char) else 2 if unicodedata.east_asian_width(char) in ('W', 'F') else 1 for char in text)


def format_table(columns, rows):
    headers = [_escape(column['name']) for column in columns]
    values = [[_cell(value) for value in row] for row in rows]
    widths = [max([_width(header)] + [_width(row[index]) for row in values]) for index, header in enumerate(headers)]
    numeric = {'INT2', 'INT4', 'INT8', 'NUMERIC', 'FLOAT4', 'FLOAT8'}
    def line(cells, header=False):
        padded = []
        for index, cell in enumerate(cells):
            space = ' ' * (widths[index] - _width(cell))
            right = not header and columns[index]['type'].upper() in numeric
            padded.append(' ' + (space + cell if right else cell + space) + ' ')
        return '|'.join(padded)
    lines = [line(headers, header=True), '+'.join('-' * (width + 2) for width in widths)] if columns else []
    lines.extend(line(row) for row in values)
    lines.append(f"({len(rows)} {'row' if len(rows) == 1 else 'rows'})")
    return '\n'.join(lines)
