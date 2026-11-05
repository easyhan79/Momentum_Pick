import {useRef,useState} from 'react';
import {mediaRequest} from '../lib/adminApi';
export function PropertyMedia({propertyId,onChanged,allowPhotos=false,allowDocuments=false,deferGeneration=false}:{propertyId:string;onChanged?:()=>void;allowPhotos?:boolean;allowDocuments?:boolean;deferGeneration?:boolean}){
 const [kind,setKind]=useState('provided_plan'),[caption,setCaption]=useState('');
 const [file,setFile]=useState<File|null>(null),[rights,setRights]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null);
 async function upload(){if(!file||!rights)return;setBusy(true);setMessage('');try{
  if(!['image/jpeg','image/png','image/webp',...(allowDocuments?['application/pdf']:[])].includes(file.type)||file.size>8*1024*1024)throw Error('8MB 이하의 지원되는 이미지 또는 PDF를 선택해 주세요.');
  if((kind==='document')!==(file.type==='application/pdf'))throw Error('PDF는 제안서·문서 유형으로, 사진과 도면은 이미지 유형으로 선택해 주세요.');
  const form=new FormData();form.set('file',file);form.set('kind',kind);if(deferGeneration)form.set('defer_generation','true');form.set('source_type','owner_provided');form.set('caption',caption.trim()?`${kind==='document'?'제공 PDF':'제공 자료'} · ${caption.trim()}`:kind==='document'?'제공 PDF · 원문 대조 및 공개 범위 확인 필요':kind==='photo'?'제공 현장사진 · 촬영일·현황 별도 확인 필요':'제공 도면 · 실제 면적·경계·인허가 별도 확인 필요');
  const result=await (await mediaRequest(`action=upload&propertyId=${propertyId}`,form)).json();
  setFile(null);setRights(false);setCaption('');if(input.current)input.current.value='';onChanged?.();
  setMessage(deferGeneration?'자료를 비공개로 저장했습니다. AI 제작은 별도로 요청할 수 있습니다.':result.analysis==='queue_failed'?'도면은 저장됐습니다. 아래에서 도면을 선택하고 분석을 요청해 주세요.':'도면을 저장하고 분석을 요청했습니다. 아래에서 진행 상태를 확인하세요.');
 }catch(e){setMessage(e instanceof Error?e.message:'도면을 등록하지 못했습니다.');}finally{setBusy(false);}}
 return <section id="property-media" className="plan-upload"><h3>{allowDocuments?'사진·도면·PDF 첨부 · 선택 사항':allowPhotos?'사진·도면 첨부 · 선택 사항':'도면 첨부 · 선택 사항'}</h3><p>보유한 자료만 첨부하세요. 자료가 없어도 기본정보로 초안을 준비할 수 있습니다. 업로드는 고객 공개를 뜻하지 않습니다. 웹 등록 PDF는 분석할 문서를 선택한 뒤 AI 분석을 요청할 수 있습니다.</p>{allowPhotos&&<label>자료 유형<select aria-label="자료 유형" value={kind} onChange={e=>setKind(e.target.value)}><option value="provided_plan">제공 도면</option><option value="photo">현장사진</option>{allowDocuments&&<option value="document">제안서·문서 (PDF)</option>}</select></label>}<label>자료 파일 · 최대 8MB<input ref={input} type="file" accept={allowDocuments?'image/jpeg,image/png,image/webp,application/pdf':'image/jpeg,image/png,image/webp'} disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>{file&&<><label>자료 설명 · 선택<input maxLength={1900} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="예: 매각제안서 · 건축물대장 · 임대차 조건"/></label><label className="plan-upload-rights"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>자료를 등록할 권한이 있습니다. 고객 공개는 쇼룸 승인 시 별도로 확인합니다.</label><button type="button" className="button button-gold" disabled={busy||!rights} onClick={()=>void upload()}>{busy?'자료 등록 중…':deferGeneration?'자료 비공개 보관':'도면 등록 및 분석 요청'}</button></>}{message&&<p role="status">{message}</p>}</section>;
}
