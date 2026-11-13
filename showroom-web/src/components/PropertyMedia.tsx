import {useRef,useState} from 'react';
import {mediaRequest} from '../lib/adminApi';
import {isHeic,isPdf,MAX_UPLOAD_BYTES,prepareImage} from '../lib/imageResize';

type Item={id:number;file:File;kind:string;state:'waiting'|'preparing'|'uploading'|'done'|'failed';note:string};
const stateLabels:Record<Item['state'],string>={waiting:'대기',preparing:'줄이는 중',uploading:'올리는 중',done:'완료',failed:'실패'};

// Several files can be chosen or dropped at once; each is prepared and uploaded in turn with its own status.
export function PropertyMedia({propertyId,onChanged,allowPhotos=false,allowDocuments=false,deferGeneration=false}:{propertyId:string;onChanged?:()=>void;allowPhotos?:boolean;allowDocuments?:boolean;deferGeneration?:boolean}){
 const [kind,setKind]=useState('provided_plan'),[caption,setCaption]=useState('');
 const [items,setItems]=useState<Item[]>([]),[rights,setRights]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[over,setOver]=useState(false);
 const input=useRef<HTMLInputElement>(null),nextId=useRef(1);
 const patch=(id:number,value:Partial<Item>)=>setItems(list=>list.map(i=>i.id===id?{...i,...value}:i));
 function add(files:FileList|File[]){
  const list=[...files].filter(f=>allowDocuments||!isPdf(f));
  setItems(current=>[...current.filter(i=>i.state!=='done'),...list.map(file=>({id:nextId.current++,file,kind:isPdf(file)?'document':kind,state:'waiting' as const,note:''}))]);
  setMessage(list.length<[...files].length?'PDF는 이 화면에서 받지 않습니다. 사진·도면 이미지만 추가했습니다.':'');
  if(input.current)input.current.value='';
 }
 async function uploadOne(item:Item){
  const fileKind=item.kind;
  let file=item.file,note='';
  if(fileKind!=='document'){
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)&&!isHeic(file))throw Error('JPG·PNG·WebP·HEIC 이미지만 올릴 수 있습니다.');
   patch(item.id,{state:'preparing'});
   const prepared=await prepareImage(file,fileKind);file=prepared.file;if(prepared.resized)note='크기를 줄여 올림';
  }else if(file.size>MAX_UPLOAD_BYTES)throw Error('PDF는 8MB 이하만 올릴 수 있습니다.');
  patch(item.id,{state:'uploading'});
  const form=new FormData();form.set('file',file);form.set('kind',fileKind);if(deferGeneration)form.set('defer_generation','true');form.set('source_type','owner_provided');
  form.set('caption',caption.trim()?`${fileKind==='document'?'제공 PDF':'제공 자료'} · ${caption.trim()}`:fileKind==='document'?'제공 PDF · 원문 대조 및 공개 범위 확인 필요':fileKind==='photo'?'제공 현장사진 · 촬영일·현황 별도 확인 필요':'제공 도면 · 실제 면적·경계·인허가 별도 확인 필요');
  const result=await (await mediaRequest(`action=upload&propertyId=${propertyId}`,form)).json();
  return {note,analysis:result.analysis as string|undefined};
 }
 async function upload(){
  if(!rights)return;setBusy(true);setMessage('');
  const pending=items.filter(i=>i.state==='waiting'||i.state==='failed');let ok=0,failed=0,queueFailed=false;
  for(const item of pending){
   try{const r=await uploadOne(item);patch(item.id,{state:'done',note:r.note});ok++;if(r.analysis==='queue_failed')queueFailed=true;}
   catch(e){patch(item.id,{state:'failed',note:e instanceof Error?e.message:'올리지 못했습니다.'});failed++;}
  }
  if(ok)onChanged?.();
  if(!failed){setRights(false);setCaption('');}
  setMessage(`${ok}개를 비공개로 저장했습니다.${failed?` ${failed}개는 실패했습니다. 실패한 파일만 다시 올릴 수 있습니다.`:''}${!deferGeneration&&ok?queueFailed?' 도면 분석 요청은 아래에서 다시 해 주세요.':' 도면 분석을 요청했습니다.':''}`);
  setBusy(false);
 }
 const waiting=items.filter(i=>i.state==='waiting'||i.state==='failed').length;
 return <section id="property-media" className="plan-upload"><h3>{allowDocuments?'사진·도면·PDF 첨부 · 선택 사항':allowPhotos?'사진·도면 첨부 · 선택 사항':'도면 첨부 · 선택 사항'}</h3>
  <p>보유한 자료만 첨부하세요. 자료가 없어도 기본정보로 초안을 준비할 수 있습니다. 업로드는 고객 공개를 뜻하지 않습니다. 큰 사진은 긴 변 2,560px로 자동으로 줄여 올립니다.</p>
  {allowPhotos&&<label>새로 추가하는 사진·도면의 기본 유형<select aria-label="자료 유형" value={kind} onChange={e=>setKind(e.target.value)}><option value="provided_plan">제공 도면</option><option value="photo">현장사진</option></select></label>}
  <div className={`media-drop${over?' media-drop-over':''}`} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);if(!busy&&e.dataTransfer.files.length)add(e.dataTransfer.files);}}>
   <p>여기에 파일을 끌어다 놓거나</p>
   <label className="button button-outline">파일 여러 개 선택<input ref={input} className="visually-hidden" type="file" multiple aria-label="자료 파일 · 여러 개 선택 가능" accept={allowDocuments?'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf':'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'} disabled={busy} onChange={e=>{if(e.target.files?.length)add(e.target.files);}}/></label>
   <small>JPG·PNG·WebP·HEIC{allowDocuments?'·PDF':''} · PDF는 8MB 이하</small>
  </div>
  {items.length>0&&<ul className="media-queue">{items.map(i=><li key={i.id} className={`media-${i.state}`}><span>{i.file.name}</span>{allowPhotos&&i.kind!=='document'&&(i.state==='waiting'||i.state==='failed')?<select aria-label={`${i.file.name} 유형`} value={i.kind} disabled={busy} onChange={e=>patch(i.id,{kind:e.target.value})}><option value="provided_plan">도면</option><option value="photo">현장사진</option></select>:<em>{i.kind==='document'?'PDF':i.kind==='photo'?'현장사진':'도면'}</em>}<strong>{stateLabels[i.state]}</strong>{i.note&&<small>{i.note}</small>}{(i.state==='waiting'||i.state==='failed')&&!busy&&<button type="button" aria-label={`${i.file.name} 빼기`} onClick={()=>setItems(list=>list.filter(x=>x.id!==i.id))}>×</button>}</li>)}</ul>}
  {waiting>0&&<><label>자료 설명 · 선택 (모든 파일에 적용)<input maxLength={1900} value={caption} onChange={e=>setCaption(e.target.value)} placeholder="예: 매각제안서 · 건축물대장 · 임대차 조건"/></label><label className="plan-upload-rights"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>자료를 등록할 권한이 있습니다. 고객 공개는 쇼룸 승인 시 별도로 확인합니다.</label><button type="button" className="button button-gold" disabled={busy||!rights} onClick={()=>void upload()}>{busy?'자료 등록 중…':deferGeneration?`${waiting}개 자료 비공개 보관`:`${waiting}개 도면 등록 및 분석 요청`}</button></>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
