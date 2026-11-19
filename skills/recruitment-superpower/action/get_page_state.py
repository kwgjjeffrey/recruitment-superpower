"""Read an explicit page's current mounted state without navigating or applying values."""
import argparse
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request,display


def get_page_state(asset_path,instance_id=None):
    action={'operation':'action.page','asset_path':asset_path,'params':None}
    if instance_id: action['instance_id']=instance_id
    return request(action)


def parse_request(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_path')
    parser.add_argument('--instance',help='Explicit connected standalone runner instance. ATS conversations keep their original tab.')
    args=parser.parse_args(argv)
    action={'operation':'action.page','asset_path':args.asset_path,'params':None}
    if args.instance: action['instance_id']=args.instance
    return action


if __name__=='__main__':
    raise SystemExit(display(parse_request()))
