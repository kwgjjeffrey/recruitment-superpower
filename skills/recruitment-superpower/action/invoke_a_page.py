"""Invoke an explicit page asset in the tab bound to this Agent conversation."""
import argparse
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request,display

def invoke(asset_path,params=None):
    return request({'operation':'action.page','asset_path':asset_path,'params':params})

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__,epilog='Named page operations use the action key inside --params, for example: --params \'{"action":"save"}\'. Add "submit":false to inspect without executing. No action means read/fill only.')
    parser.add_argument('asset_path')
    parser.add_argument('--params',type=json.loads,help='JSON field patch; include "action":"<operation>" to execute. Omit to read the target page.')
    args=parser.parse_args()
    raise SystemExit(display({'operation':'action.page','asset_path':args.asset_path,'params':args.params}))
