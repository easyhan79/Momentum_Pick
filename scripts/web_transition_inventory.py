"""Read-only queue/public-snapshot evidence. No migration or paid AI request."""
import argparse
import json
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from web_worker import configuration, Database


def compare(before, after):
    return {'publishedUnchanged':before.get('publishedDigest')==after.get('publishedDigest') and before.get('publishedCount')==after.get('publishedCount'),
            'reservedBudgetPreserved':after.get('imageBudget',{}).get('reserved',-1)>=before.get('imageBudget',{}).get('reserved',0),
            'routeViolations':after.get('routeViolations')}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true',help='Read the explicitly bound environment via one inventory RPC')
    parser.add_argument('--input',type=Path,help='Existing inventory JSON; no network')
    parser.add_argument('--before',type=Path,help='Compare with a prior inventory; no state mutation')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if bool(args.live)==bool(args.input):parser.error('select --live or --input')
    if args.live:
        import requests
        config=configuration({**os.environ,'WEB_WORKER_ENABLED':'true'},require_ai=False)
        result=Database(config,requests).rpc('web_transition_inventory',{})
    else:
        result=json.loads(args.input.read_text())
    if not isinstance(result,dict) or not all(k in result for k in ['publishedDigest','publishedCount','imageBudget','routeViolations']):
        raise ValueError('invalid_inventory')
    if args.before:
        result={**result,'comparison':compare(json.loads(args.before.read_text()),result)}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary=args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');temporary.chmod(0o600);temporary.replace(args.output)
    print('Inventory saved; readonly=true; environment='+('live_bound' if args.live else 'local_file'))


if __name__=='__main__':
    try:main()
    except Exception as exc:
        print('inventory unavailable type='+type(exc).__name__,file=sys.stderr)
        raise SystemExit(1) from None
