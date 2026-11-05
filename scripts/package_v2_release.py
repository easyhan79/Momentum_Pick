"""Package the verified worktree for deployment; never contacts a server."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import hashlib
import json
import subprocess
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'showroom-web/test-results/release'
worker=ROOT/'showroom-web/dist/server/index.js'
readiness=json.loads((ROOT/'showroom-web/test-results/v2-readiness.json').read_text())
if not worker.is_file() or not readiness.get('complete'):
    raise SystemExit('A completed local readiness check and built Worker are required')
paths=set()
for directory in ['showroom-web/src','showroom-web/server','showroom-web/scripts','supabase/functions','supabase/migrations','.github/workflows','scripts','tests','docs']:
    paths.update(p for p in (ROOT/directory).rglob('*') if p.is_file() and p.suffix in {'.ts','.tsx','.js','.mjs','.cjs','.json','.css','.py','.md','.yml','.txt'})
paths.update(ROOT.glob('*.py'))
paths.update(ROOT.glob('requirements*.txt'))
for filename in ['README.md','showroom-web/package.json','showroom-web/pnpm-lock.yaml','showroom-web/tsconfig.json','showroom-web/vite.config.ts']:
    paths.add(ROOT/filename)
files={f'source/{p.relative_to(ROOT).as_posix()}':p for p in paths}
files['frontend/server/index.js']=worker
files['frontend/.openai/hosting.json']=ROOT/'showroom-web/.openai/hosting.json'
files['VALIDATION.json']=ROOT/'showroom-web/test-results/v2-readiness.json'
for relative in files:
    parts=Path(relative).parts
    if any(part in {'.git','.env','.aws','.codex','node_modules','__pycache__','attachments','test-results'} for part in parts) or relative.lower().endswith('.pdf'):
        raise SystemExit('Unexpected private/generated input in release selection')
manifest={'created_at':datetime.now(ZoneInfo('Asia/Seoul')).isoformat(),'status':'prepared_not_deployed','base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'uncommitted_worktree':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()),'target_project':'appgprj_6ae876464cdc8191a6fdacb4d382dd60','readiness_finished_at':readiness['finished_at'],'files':{name:hashlib.sha256(p.read_bytes()).hexdigest() for name,p in sorted(files.items())}}
OUTPUT.mkdir(parents=True,exist_ok=True)
destination=OUTPUT/'SpacePick-v2-release.zip'
with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name,p in sorted(files.items()):
        archive.write(p,name)
    archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
manifest['archive_sha256']=hashlib.sha256(destination.read_bytes()).hexdigest()
(OUTPUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Prepared:',destination)
print('Files:',len(files),'bytes:',destination.stat().st_size,'SHA256:',manifest['archive_sha256'])
