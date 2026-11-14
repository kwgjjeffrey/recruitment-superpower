"""Read an authorized semantic asset, child reference or directory through the local runtime."""
import argparse
from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import display, request


def view(asset_path='recruitment', show='summary', type_=None, section=None):
    return request({'operation': 'semantics.view', 'asset_path': asset_path,
                    'show': show, 'type': type_, 'section': section})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_path', nargs='?', default='recruitment')
    parser.add_argument('--section', help='Inspect one section of this page without creating another asset.')
    parser.add_argument('--show', choices=['summary', 'columns', 'full'], default='summary')
    parser.add_argument('--type', choices=['page', 'view', 'function', 'table', 'column'])
    parser.add_argument('--format', choices=['yaml', 'json'], default='yaml')
    args = parser.parse_args()
    raise SystemExit(display({'operation': 'semantics.view', 'asset_path': args.asset_path,
                             'show': args.show, 'type': args.type, 'section': args.section}, output=args.format))
