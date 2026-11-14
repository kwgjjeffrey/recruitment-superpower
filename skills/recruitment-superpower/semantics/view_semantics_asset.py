"""Read an authorized semantic asset, child reference or directory through the local runtime."""
import argparse
from pathlib import Path
import sys
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import display, request


def view(asset_path):
    return request({'operation': 'semantics.view', 'asset_path': asset_path})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_path')
    args = parser.parse_args()
    raise SystemExit(display({'operation': 'semantics.view', 'asset_path': args.asset_path}))
