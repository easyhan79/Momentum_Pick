"""Atomically persist a small, explicit development checkpoint (no remote work)."""
import argparse,json,os,subprocess
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
def save(path,text):
    temp=path.with_name(path.name+'.tmp');temp.write_text(text);os.replace(temp,path)
def checkpoint(stage,status,note,next_action,check=None,complete=False,pushed=False):
    path=ROOT/'SPACEPICK_V2_1_RUN_STATE.json';state=json.loads(path.read_text())
    now=datetime.now(ZoneInfo('Asia/Seoul')).isoformat()
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()
    allowed=['not_started','in_progress','local_complete','blocked_external','blocked_test','paused_limit','all_local_complete']
    if stage not in state['stageOrder'] or status not in allowed:raise ValueError('invalid_checkpoint')
    changed=subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).splitlines()
    state['workingTreeChanges']=[line[3:] for line in changed if len(line)>3]
    state.update(currentStage=stage,status=status,nextAction=next_action,updatedAt=now,lastCommit=head,branch=branch)
    state.setdefault('stages',{})[stage]={'status':'local_complete' if complete else status,'updatedAt':now,'lastUnit':note}
    if pushed:state.update(pushStatus='feature_branch_pushed',lastPushedCommit=head,remoteBranch=branch)
    if complete:state['lastCompletedStage']=stage
    if check:state['lastSuccessfulCheck']={'command':check,'at':now}
    save(path,json.dumps(state,ensure_ascii=False,indent=2)+'\n')
    json.loads(path.read_text())
    progress=ROOT/'SPACEPICK_V2_1_PROGRESS.md'
    save(progress,progress.read_text()+f'\n## {now} — {stage} / {status}\n\n- 변경/완료 상태: {note}\n- 검증: {check or "이 체크포인트에서 새 검증 없음"}\n- 변경 파일: {', '.join(state['workingTreeChanges']) or '없음'}\n- Git: {branch} / {head}; v2.1 운영 배포 없음.\n- 다음: {next_action}\n')
    print(stage,status,'checkpoint saved')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('stage');p.add_argument('status');p.add_argument('note');p.add_argument('next_action');p.add_argument('--check');p.add_argument('--complete',action='store_true');p.add_argument('--pushed',action='store_true');a=p.parse_args();checkpoint(a.stage,a.status,a.note,a.next_action,a.check,a.complete,a.pushed)
