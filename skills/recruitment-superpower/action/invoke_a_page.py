"""Invoke an explicit page asset in the tab bound to this Agent conversation."""
import argparse
import json
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request,display

def invoke(asset_path,params=None,instance_id=None):
    action={'operation':'action.page','asset_path':asset_path,'params':params}
    if instance_id: action['instance_id']=instance_id
    return request(action)

def parse_request(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,epilog='Named page operations use the action key inside --params, for example: --params \'{"action":"save"}\'. Add "submit":false to inspect without executing. No action means read/fill only.')
    parser.add_argument('asset_path')
    parser.add_argument('--instance',help='Explicit connected standalone runner instance. ATS conversations keep their original tab.')
    parser.add_argument('--section',help='Displayed page section, equivalent to section inside --params.')
    parser.add_argument('--params',type=json.loads,help='JSON field patch; include "action":"<operation>" to execute. Omit to read the target page.')
    args=parser.parse_args(argv)
    if args.params is not None and not isinstance(args.params,dict):
        parser.error('--params must be a JSON object')
    params=args.params
    if args.section is not None:
        params=dict(params or {})
        if 'section' in params and params['section']!=args.section:
            parser.error('--section conflicts with section inside --params')
        params['section']=args.section
    action={'operation':'action.page','asset_path':args.asset_path,'params':params}
    if args.instance: action['instance_id']=args.instance
    return action

if __name__=='__main__':
    raise SystemExit(display(parse_request()))
