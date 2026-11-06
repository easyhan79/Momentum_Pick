"""Repeatable local validation; never calls production APIs or AI providers.

Install the optional standalone SQL test tool as documented in
docs/SPACEPICK_V2_VALIDATION.md, then set PGLITE_MODULE to its ESM entry.
Missing SQL tooling is reported as unrun and makes this full check incomplete.
Browser checks require a local server and are documented separately.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
node=shutil.which('node') or 'node'
pnpm=shutil.which('pnpm') or 'pnpm'
cases=[
 ('web-build',[pnpm,'run','build'],ROOT/'showroom-web'),
 ('api-typecheck',[pnpm,'exec','tsc','--ignoreConfig','--noEmit','--allowImportingTsExtensions','--moduleResolution','bundler','--module','esnext','--target','es2022','--lib','es2022,dom','--skipLibCheck','../supabase/functions/showroom-admin/index.ts','../supabase/functions/showroom-assets/index.ts','../supabase/functions/public-showroom/index.ts'],ROOT/'showroom-web'),
 ('python-tests',[sys.executable,'-m','unittest','discover','-s','tests','-p','test_*.py'],ROOT),
]
for filename in ['supabase/tests/admin-api.test.ts','supabase/tests/public-showroom.test.ts','supabase/tests/publication.test.ts','supabase/tests/assets-api.test.ts','supabase/tests/image-package-api.test.ts','supabase/tests/plan-flow.test.ts','supabase/tests/property-profile.test.ts','supabase/tests/web-registration-api.test.ts','supabase/tests/concept-edits.test.ts','supabase/tests/image-settings.test.ts','supabase/tests/document-review.test.ts','tests/industrial-review.test.ts','tests/property-review.test.ts','showroom-web/server/router.test.mjs']:
 cases.append((filename,[node,filename],ROOT))
cases.append(('supabase/tests/rental-scenario.test.ts',[node,'supabase/tests/rental-scenario.test.ts'],ROOT))
cases.append(('tests/private-pdf.test.ts',[node,'tests/private-pdf.test.ts'],ROOT))
cases.append(('tests/customer-review.test.ts',[node,'tests/customer-review.test.ts'],ROOT))
cases.append(('supabase/tests/customer-copy.test.ts',[node,'supabase/tests/customer-copy.test.ts'],ROOT))
cases.append(('showroom-web/scripts/built-assets.test.mjs',[node,'showroom-web/scripts/built-assets.test.mjs'],ROOT))
report={'started_at':datetime.now(ZoneInfo('Asia/Seoul')).isoformat(),'scope':'local build, typecheck, mock tests, bounded PDF inspection and isolated SQL; production/browser/provider accuracy excluded','checks':[],'complete':False,'current_check':None}
destination=ROOT/'showroom-web/test-results/v2-readiness.json'
def checkpoint():
 destination.parent.mkdir(parents=True,exist_ok=True)
 temporary=destination.with_suffix('.json.tmp')
 temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 temporary.replace(destination)
checkpoint()
for name,command,directory in cases:
 report['current_check']=name;checkpoint()
 start=time.monotonic()
 try:
  result=subprocess.run(command,cwd=directory,text=True,capture_output=True,timeout=180)
  check={'name':name,'status':'passed' if result.returncode==0 else 'failed','exit_code':result.returncode,'output':result.stdout+result.stderr}
 except (OSError,subprocess.TimeoutExpired) as error:
  check={'name':name,'status':'failed','output':str(error)}
 check['seconds']=round(time.monotonic()-start,2);report['checks'].append(check)
 report['current_check']=None;checkpoint()
 print(check['status'].upper(),name,flush=True)
for filename in ['web-registration-db.test.mjs','concept-images-db.test.mjs','private-pdf-bucket-db.test.mjs']:
 report['current_check']=filename;checkpoint()
 if not os.environ.get('PGLITE_MODULE'):
  check={'name':filename,'status':'unrun','reason':'Set PGLITE_MODULE to the installed @electric-sql/pglite ESM entry'}
 else:
  try:
   result=subprocess.run([node,'supabase/tests/'+filename],cwd=ROOT,text=True,capture_output=True,timeout=180)
   check={'name':filename,'status':'passed' if result.returncode==0 else 'failed','exit_code':result.returncode,'output':result.stdout+result.stderr}
  except (OSError,subprocess.TimeoutExpired) as error:
   check={'name':filename,'status':'failed','output':str(error)}
 report['checks'].append(check);report['current_check']=None;checkpoint();print(check['status'].upper(),filename,flush=True)
report['complete']=all(check['status']=='passed' for check in report['checks'])
report['finished_at']=datetime.now(ZoneInfo('Asia/Seoul')).isoformat();checkpoint()
print('REPORT',destination,flush=True)
sys.exit(0 if report['complete'] else 1)
