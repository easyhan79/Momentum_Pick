import {useEffect,useRef,useState} from 'react';
import {AdminApiError,api} from '../lib/adminApi';
import {imageSlots,stateLabels,workflowStages,type ImageJob,type RewriteJob,type Stage} from '../lib/workflow';
import {IMAGE_RESERVATION_KRW} from '../../../supabase/functions/_shared/image-settings.ts';

type Step='input'|'brief'|'publish'|'advanced';
type Room={property_id:string;revision:number;published_revision?:number;showroom_status:string;draft_content:any};
const stepFor:Record<Stage['key'],Step>={analysis:'input',brief:'brief',copy:'publish',images:'publish',marketing:'publish',publish:'publish'};

// One line showing where the listing is: 분석 → 기획서 → 글 → 이미지 → 블로그·카드뉴스 → 게시.
export function WorkflowProgress({room,busy,onGo}:{room:Room;busy:boolean;onGo:(step:Step)=>void}){
  const [rewrites,setRewrites]=useState<RewriteJob[]>([]),[images,setImages]=useState<ImageJob[]>([]),[budget,setBudget]=useState({limit_krw:2500,reserved_krw:0});
  const [message,setMessage]=useState(''),[requesting,setRequesting]=useState(false),alive=useRef(true);
  async function load(){
    const [r,i]=await Promise.allSettled([api<{jobs:RewriteJob[]}>(`action=copy-rewrites&propertyId=${room.property_id}`),api<{jobs:ImageJob[];budget:{limit_krw:number;reserved_krw:number}}>(`action=image-package&propertyId=${room.property_id}`)]);
    if(!alive.current)return;
    if(r.status==='fulfilled')setRewrites(r.value.jobs||[]);
    if(i.status==='fulfilled'){setImages(i.value.jobs||[]);if(i.value.budget)setBudget(i.value.budget);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[room.property_id,room.revision]);
  const stages=workflowStages(room,rewrites,images),running=stages.some(s=>s.state==='running');
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[running,room.property_id]);

  const slots=imageSlots(room),missing=slots.filter(s=>!images.some(j=>j.slot===s&&j.state==='done'&&j.asset_id));
  const remaining=Math.max(0,budget.limit_krw-budget.reserved_krw),affordable=Math.min(missing.length,Math.floor(remaining/IMAGE_RESERVATION_KRW));
  const imageStage=stages.find(s=>s.key==='images')!,copyStage=stages.find(s=>s.key==='copy')!;
  const canRequest=!!room.draft_content.brief&&missing.length>0&&imageStage.state!=='running';

  async function requestImages(){
    const targets=missing.slice(0,affordable);
    if(!targets.length){setMessage(`남은 이미지 예산(${remaining.toLocaleString()}원)이 부족합니다.`);return;}
    if(!window.confirm(`글에 맞춰 이미지 ${targets.length}장을 만듭니다.\n장당 최대 ${IMAGE_RESERVATION_KRW}원, 합계 최대 ${(targets.length*IMAGE_RESERVATION_KRW).toLocaleString()}원을 예약합니다.\n남은 예산: ${remaining.toLocaleString()}원`))return;
    setRequesting(true);setMessage('');
    try{
      for(const slot of targets){const job=images.find(j=>j.slot===slot);await api('','POST',{action:'generate-image',propertyId:room.property_id,slot,retry:job?.state==='failed'||job?.state==='budget_blocked',costConfirmed:true});}
      setMessage(`이미지 ${targets.length}장을 요청했습니다. 완료되면 여기와 미리보기에 반영됩니다.`);
      await load();
    }catch(e){
      if(e instanceof AdminApiError&&e.code==='api_image_opt_in_required')setMessage('API 이미지 생성이 운영 설정에서 꺼져 있습니다(WEB_API_IMAGES_ENABLED). 「고급 편집」의 「Gemini 웹 이미지 가져오기」로 직접 만들어 올릴 수 있습니다.');
      else setMessage(e instanceof Error?e.message:'이미지를 요청하지 못했습니다.');
    }finally{if(alive.current)setRequesting(false);}
  }

  return <div className="workflow-progress" aria-label="진행 상황">
    <ol>{stages.map(s=><li key={s.key} className={`workflow-${s.state}`}><button type="button" onClick={()=>onGo(stepFor[s.key])} title={s.detail}><strong>{s.label}</strong><span>{stateLabels[s.state]} · {s.detail}</span></button></li>)}</ol>
    {canRequest&&<div className="workflow-action"><span>{copyStage.state==='done'?'글이 준비됐습니다. 같은 기획서로 이미지를 만들 차례입니다.':'기획서가 있습니다. 글 적용 후 이미지를 만들면 글과 같은 메시지가 됩니다.'}</span>
      <button type="button" className="button button-gold" disabled={busy||requesting||affordable===0} onClick={()=>void requestImages()}>{requesting?'요청 중…':`이 글에 맞춰 이미지 만들기 (${Math.min(missing.length,Math.max(affordable,0))}장 · 최대 ${(Math.min(missing.length,affordable)*IMAGE_RESERVATION_KRW).toLocaleString()}원)`}</button></div>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
