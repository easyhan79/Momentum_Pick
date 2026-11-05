import {createContext,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {mediaRequest} from '../lib/adminApi';

export type PrivateMediaItem={id:string;caption:string;kind:string};
// One in-memory cache per property view. Private bytes never become public URLs.
function createImageCache(propertyId:string){
 const pending=new Map<string,Promise<string>>(),urls=new Set<string>();let generation=0;
 return {
  get(id:string){let promise=pending.get(id);if(!promise){const current=generation;promise=mediaRequest(`action=image&propertyId=${encodeURIComponent(propertyId)}&assetId=${encodeURIComponent(id)}`).then(async response=>{const blob=await response.blob();if(!['image/jpeg','image/png','image/webp'].includes(blob.type.split(';')[0]))throw Error('unsupported_image');if(current!==generation)throw Error('view_closed');const url=URL.createObjectURL(blob);urls.add(url);return url;}).catch(error=>{if(current===generation)pending.delete(id);throw error;});pending.set(id,promise);}return promise;},
  clear(){generation++;urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();pending.clear();}
 };
}
const Images=createContext<ReturnType<typeof createImageCache>|null>(null);
export function PrivateMediaProvider({propertyId,children}:{propertyId:string;children:ReactNode}){
 const cache=useMemo(()=>createImageCache(propertyId),[propertyId]);
 useEffect(()=>()=>cache.clear(),[cache]);
 return <Images.Provider value={cache}>{children}</Images.Provider>;
}
function usePrivateImage(id:string,enabled=true){
 const cache=useContext(Images),[state,setState]=useState({id:'',url:'',error:false});
 useEffect(()=>{if(!cache||!id||!enabled)return;let active=true;setState({id,url:'',error:false});void cache.get(id).then(url=>{if(active)setState({id,url,error:false});}).catch(()=>{if(active)setState({id,url:'',error:true});});return()=>{active=false;};},[cache,id,enabled]);
 return state.id===id?state:{id,url:'',error:false};
}
export function PrivateMediaImage({item,alt,lazy=false}:{item:PrivateMediaItem;alt:string;lazy?:boolean}){
 const target=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(!lazy);
 useEffect(()=>{if(!lazy||visible)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});if(target.current)observer.observe(target.current);return()=>observer.disconnect();},[lazy,visible]);
 const {url,error}=usePrivateImage(item.id,visible),[failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 return <span ref={target} className="private-media-image">{url&&!failed?<img src={url} alt={alt} loading={lazy?'lazy':'eager'} onError={()=>setFailed(true)}/>:<span className="private-media-placeholder">{error||failed?'미리보기를 불러오지 못했습니다':'이미지 불러오는 중…'}</span>}</span>;
}
export function PrivateMediaPicker({title,items,value,onChange,disabled=false,allowEmpty=false,loading=false}:{title:string;items:PrivateMediaItem[];value:string;onChange:(id:string)=>void;disabled?:boolean;allowEmpty?:boolean;loading?:boolean}){
 const [preview,setPreview]=useState<PrivateMediaItem|null>(null),[zoom,setZoom]=useState(100),dialog=useRef<HTMLDialogElement>(null),heading=useId();
 const current=items.find(item=>item.id===value),number=(item:PrivateMediaItem)=>items.findIndex(a=>a.id===item.id)+1;
 const previewImage=usePrivateImage(preview?.id||'',!!preview);
 useEffect(()=>{setZoom(100);if(preview&&!dialog.current?.open)dialog.current?.showModal();if(!preview&&dialog.current?.open)dialog.current.close();},[preview]);
 const kind=(item:PrivateMediaItem)=>item.kind==='provided_plan'?'제공 도면':item.kind==='photo'?'현장 사진':item.kind==='concept'?'활용 이미지':'분류 전 이미지';
 return <fieldset className="private-media-picker"><legend>{title}</legend><p className="private-media-help">사진을 눌러 선택하고 ‘크게 보기’로 글씨와 세부 내용을 확인하세요.</p>{allowEmpty&&<button type="button" className={`button ${!value?'button-gold':'button-outline'}`} disabled={disabled} aria-pressed={!value} onClick={()=>onChange('')}>배경 없이 개념도 사용</button>}
 {loading?<p role="status">등록된 자료를 불러오는 중입니다.</p>:!items.length?<p>등록된 이미지가 없습니다. 아래 ‘매물 사진·도면’에서 자료를 등록해 주세요.</p>:<div className="private-media-grid">{items.map((item,i)=><article className={`private-media-card ${value===item.id?'is-selected':''}`} key={item.id}><button type="button" className="private-media-choice" disabled={disabled} aria-pressed={value===item.id} aria-label={`자료 ${i+1} 선택 · ${kind(item)}`} onClick={()=>onChange(item.id)}><PrivateMediaImage item={item} alt={`자료 ${i+1} · ${item.caption||kind(item)}`} lazy/><span className="private-media-card-top"><strong>자료 {i+1}</strong><span>{value===item.id?'✓ 선택됨':kind(item)}</span></span><span className="private-media-card-caption">{item.caption||kind(item)}</span></button><button type="button" className="private-media-expand" aria-label={`자료 ${i+1} 크게 보기`} onClick={()=>setPreview(item)}>크게 보기 ↗</button></article>)}</div>}
 {current&&<figure className="private-media-selected"><figcaption><strong>선택한 자료 {number(current)}</strong> · {kind(current)}</figcaption><button type="button" onClick={()=>setPreview(current)} aria-label={`선택한 자료 ${number(current)} 확대`}><PrivateMediaImage item={current} alt={`선택한 자료 ${number(current)} · ${current.caption}`}/><span>눌러서 크게 보기 ↗</span></button></figure>}
 <dialog ref={dialog} className="private-media-dialog" aria-labelledby={heading} onCancel={()=>setPreview(null)} onClose={()=>setPreview(null)}><header><div><p>비공개 자료 미리보기</p><h3 id={heading}>{preview?`자료 ${number(preview)} · ${kind(preview)}`:'자료 미리보기'}</h3></div><button type="button" className="button button-outline" onClick={()=>setPreview(null)}>닫기 ✕</button></header><p className="private-media-dialog-caption">{preview?.caption}</p><div className="private-media-zoom"><label>확대 {zoom}%<input aria-label="이미지 확대 비율" type="range" min="100" max="300" step="25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>{previewImage.url&&<a href={previewImage.url} target="_blank" rel="noopener noreferrer" className="button button-outline">원본 크기로 열기 ↗</a>}</div><div className="private-media-viewer">{previewImage.url?<img src={previewImage.url} alt={preview?.caption||'선택한 비공개 자료'} style={{width:`${zoom}%`}}/>:<p role="status">{previewImage.error?'자료를 불러오지 못했습니다. 목록을 새로고침해 주세요.':'이미지를 불러오는 중입니다.'}</p>}</div></dialog>
 </fieldset>;
}
