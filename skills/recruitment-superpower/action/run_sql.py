"""Query quoted table asset paths through the runtime and controlled application SQL API."""
import argparse
from pathlib import Path
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from utils.runtime_client import request,display

def run(sql):
    return request({'operation':'action.sql','sql':sql})

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sql',help='One SELECT query; table references use quoted asset paths.')
    args=parser.parse_args()
    raise SystemExit(display({'operation':'action.sql','sql':args.sql}))
