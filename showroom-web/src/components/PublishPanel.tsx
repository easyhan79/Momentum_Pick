import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/adminApi';
import {blockingIssues,publicationChecklist,publishConfirmMessage,warningIssues} from '../lib/publication';
import type {PublicationIssue} from '../lib/publication';
type Room={property_id:string;slug:string;revision:number;published_revision?:number;showroom_status:string};
type Readiness={revision:number;issues:PublicationIssue[]};
type Props={room:Room;busy:boolean;dirty:boolean;onPublish:()=>Promise<void>;onSave:()=>void;onReload:()=>void;onUnpublish:()=>void;onUnlinkPlan:(assetId:string)=>void;onPublishCoreFacts:()=>void;onNavigate?:(targetId:string)=>void};

export function PublishPanel({room,busy,dirty,onPublish,onSave,onReload,onUnpublish,onUnlinkPlan,onPublishCoreFacts,onNavigate}:Props){
 const [report,setReport]=useState<Readiness>(),[checking,setChecking]=useState(false),[showIssues,setShowIssues]=useState(false),[error,setError]=useState('');
 const alive=useRef(true),sequence=useRef(0),notice=useRef<HTMLDivElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
 useEffect(()=>{
  const seq=++sequence.current;setReport(undefined);
  void api<Readiness>(`action=publish-readiness&propertyId=${room.property_id}`)
   .then(value=>{if(alive.current&&seq===sequence.current){setReport(value);setError('');}})
   .catch(()=>{if(alive.current&&seq===sequence.current)setError('게시 조건을 불러오지 못했습니다. 「조건 다시 확인」을 눌러 주세요.');});
 },[room.property_id,room.revision]);

 async function read(){
  const seq=++sequence.current;
  const value=await api<Readiness>(`action=publish-readiness&propertyId=${room.property_id}`);
  if(alive.current&&seq===sequence.current)setReport(value);
  return value;
 }
 function issuesFor(value?:Readiness){
  const server=value?.issues||[];
  const changed=value&&value.revision!==room.revision?[{code:'revision_conflict',message:'서버에 더 최신 저장본이 있습니다. 「최신 저장본 불러오기」를 눌러 주세요.',target:'publish-review'}]:server;
  return publicationChecklist(dirty,changed);
 }
 const issues=issuesFor(report),blocking=blockingIssues(issues),warnings=warningIssues(issues);
 const published=room.showroom_status==='published'&&room.published_revision===room.revision&&!dirty;

 function move(targetId:string){
  // A panel outside the current step is opened through the page (which switches to the full panel view).
  const target=document.getElementById(targetId);if(!target){onNavigate?.(targetId);return;}
  target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  const control=target.matches('input,textarea,select,button')?target:target.querySelector<HTMLElement>('input,textarea,select,button');
  (control as HTMLElement|null)?.focus({preventScroll:true});
 }
 async function submit(){
  setChecking(true);setError('');
  try{
   const fresh=await read();if(!alive.current)return;
   if(blockingIssues(issuesFor(fresh)).length){setShowIssues(true);requestAnimationFrame(()=>notice.current?.scrollIntoView({behavior:'smooth',block:'center'}));return;}
   if(!window.confirm(publishConfirmMessage))return;
   await onPublish();if(alive.current)setShowIssues(false);
  }catch(e){if(alive.current){setError(e instanceof Error?e.message:'게시 요청을 처리하지 못했습니다.');setShowIssues(true);void read().catch(()=>{});}}
  finally{if(alive.current)setChecking(false);}
 }
 function recheck(){
  setChecking(true);setError('');
  void read().then(()=>{if(alive.current)setShowIssues(true);})
   .catch(e=>{if(alive.current)setError(e instanceof Error?e.message:'상태를 확인하지 못했습니다.');})
   .finally(()=>{if(alive.current)setChecking(false);});
 }
 const actionFor=(issue:PublicationIssue)=>issue.code==='unsaved_changes'?<button type="button" onClick={onSave} disabled={busy||checking}>초안 저장</button>
  :issue.code==='revision_conflict'?<button type="button" onClick={onReload} disabled={busy||checking}>최신 저장본 불러오기</button>
  :issue.code==='core_facts_private'?<button type="button" onClick={onPublishCoreFacts} disabled={busy||checking}>입력한 면적 공개</button>
  :<><button type="button" onClick={()=>move(issue.target)}>해결할 위치로 이동 →</button>{issue.code==='invalid_plan'&&issue.assetId&&<button type="button" disabled={busy||checking||dirty} onClick={()=>onUnlinkPlan(issue.assetId!)}>참고용으로 유지 · 배경 연결 해제</button>}</>;
 const heading=showIssues?(blocking.length?`먼저 처리할 작업 ${blocking.length}개`:'게시 준비가 됐습니다.'):report?(blocking.length?`게시 전 필요한 작업 ${blocking.length}개`:'게시 준비 완료'):'게시 조건을 확인하고 있습니다.';

 return <section id="publish-review" className="glass admin-editor publish-panel">
  <p className="eyebrow">REVIEW / PUBLISH</p><h2>공개 준비와 게시</h2>
  <p>현재 상태: <strong>{published?'게시 중':'비공개 초안'}</strong> · {dirty?'저장 전 수정 있음':`저장본 ${room.revision}`}</p>
  <p>「게시하기」를 누르면 게시 조건을 확인하고, 주소·거래조건·가격·면적·연락처를 한 번 확인한 뒤 공개합니다.</p>
  <div className="admin-toolbar">
   {dirty&&<button type="button" className="button button-outline" disabled={busy||checking} onClick={onSave}>초안 저장</button>}
   <button type="button" className="button button-outline" disabled={busy||checking} onClick={recheck}>조건 다시 확인</button>
   <button type="button" className="button button-outline" disabled={busy||checking} onClick={onReload}>최신 저장본 불러오기</button>
  </div>
  <div ref={notice} className={`publish-readiness ${showIssues&&blocking.length?'needs-action':''}`} aria-live="polite">
   {published?<><strong>현재 저장본이 공개됐습니다.</strong><p>아래 링크에서 고객에게 보이는 화면을 열 수 있습니다.</p><a className="button button-outline" href={`/${encodeURIComponent(room.slug)}`} target="_blank" rel="noopener noreferrer">공개 쇼룸 열기 ↗</a></>
   :<><strong>{heading}</strong>
    {showIssues&&blocking.length>0&&<ol>{blocking.map((issue,i)=><li key={`${issue.code}-${i}`}><p>{issue.message}</p><div>{actionFor(issue)}</div></li>)}</ol>}
    {!showIssues&&<p>게시하기를 누르면 현재 조건을 다시 확인하고, 미완료 항목을 여기에 표시합니다.</p>}
   </>}
   {!published&&warnings.length>0&&<div className="publish-warnings"><p><strong>참고 · 게시는 가능합니다</strong></p><ul>{warnings.map((issue,i)=><li key={`${issue.code}-${i}`}><p>{issue.message}</p><div>{actionFor(issue)}</div></li>)}</ul></div>}
  </div>
  {error&&<p className="admin-message admin-error" role="alert">{error}</p>}
  <div className="admin-toolbar">
   {!published&&<button type="button" className="button button-gold" disabled={busy||checking} onClick={()=>void submit()}>{checking?'게시 조건 확인 중…':busy?'처리 중…':room.published_revision?'변경사항 게시하기':'게시하기'}</button>}
   {room.showroom_status==='published'&&<button type="button" className="button button-outline" disabled={busy||checking} onClick={onUnpublish}>게시 중단</button>}
  </div>
 </section>;
}
