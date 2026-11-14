"""Call a function asset through the local runtime with application authorization."""
import argparse
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request,display

def call(asset_path,params=None):
    return request({'operation':'action.function','asset_path':asset_path,'params':params or {}})

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_path')
    parser.add_argument('--params',type=json.loads,default={})
    args=parser.parse_args()
    raise SystemExit(display({'operation':'action.function','asset_path':args.asset_path,'params':args.params}))
