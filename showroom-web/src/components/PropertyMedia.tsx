import {useRef,useState} from 'react';
import {mediaRequest} from '../lib/adminApi';
export function PropertyMedia({propertyId,onChanged}:{propertyId:string;onChanged?:()=>void}){
 const [file,setFile]=useState<File|null>(null),[rights,setRights]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function upload(){if(!file||!rights)return;setBusy(true);setMessage('');try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('8MB 이하 JPEG·PNG·WebP 도면을 선택해 주세요.');
  const form=new FormData();form.set('file',file);form.set('kind','provided_plan');form.set('source_type','owner_provided');form.set('caption','제공 도면 · 실제 면적·경계·인허가 별도 확인 필요');
  const result=await (await mediaRequest(`action=upload&propertyId=${propertyId}`,form)).json();
  setFile(null);setRights(false);if(input.current)input.current.value='';onChanged?.();
  setMessage(result.analysis==='queue_failed'?'도면은 저장됐습니다. 아래에서 도면을 선택하고 분석을 요청해 주세요.':'도면을 저장하고 분석을 요청했습니다. 아래에서 진행 상태를 확인하세요.');
 }catch(e){setMessage(e instanceof Error?e.message:'도면을 등록하지 못했습니다.');}finally{setBusy(false);}}
 return <section id="property-media" className="plan-upload"><h3>도면 첨부 · 선택 사항</h3><p>도면이 있을 때만 첨부하세요. 현장사진은 필요하지 않습니다. 도면이 없으면 AI 구상도를 사용합니다.</p><label>도면 이미지 · 최대 8MB<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{file&&<><label className="plan-upload-rights"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>도면을 등록할 권한이 있습니다. 고객 공개는 쇼룸 승인 시 별도로 확인합니다.</label><button type="button" className="button button-gold" disabled={busy||!rights} onClick={()=>void upload()}>{busy?'도면 등록 중…':'도면 등록 및 분석 요청'}</button></>}{message&&<p role="status">{message}</p>}</section>;
}
