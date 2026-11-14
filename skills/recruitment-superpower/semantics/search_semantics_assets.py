"""Search authorized semantic assets through the local runtime."""
import argparse
from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import display, request


def search(query, kind=None, mode='hybrid'):
    return request({'operation': 'semantics.search', 'query': query, 'kind': kind, 'mode': mode})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query')
    parser.add_argument('--type', '--kind', dest='kind', choices=['page', 'function', 'table', 'view', 'column'])
    parser.add_argument('--mode', choices=['keyword', 'vector', 'hybrid'], default='hybrid')
    parser.add_argument('--format', choices=['yaml', 'json'], default='yaml')
    args = parser.parse_args()
    raise SystemExit(display({'operation': 'semantics.search', 'query': args.query,
                             'kind': args.kind, 'mode': args.mode}, output=args.format))
