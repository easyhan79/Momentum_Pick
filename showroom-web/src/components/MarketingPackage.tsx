import {useCallback,useEffect,useState} from 'react';
import {api} from '../lib/adminApi';
import {CardNews} from './CardNews';
import {PropertyMedia} from './PropertyMedia';
import {BlogPreview} from './BlogPreview';
import {ImageStudio} from './ImageStudio';
import {normalizeCopy} from '../lib/blogPreview';
import {useMediaLibrary} from '../lib/useMediaLibrary';
import type {Concept} from '../types/showroom';

type Content={target_1_blog:string;target_2_blog:string;insta_caption:string};
const channels=[['target_1_blog','블로그 · 타깃 1'],['target_2_blog','블로그 · 타깃 2'],['insta_caption','인스타그램 · 카드뉴스 구성안']] as const;
export function MarketingPackage({propertyId,revision,onSaved,locked,concepts=[]}:{propertyId:string;concepts?:Concept[];revision:number;onSaved:(revision:number)=>void;locked:boolean}){
  const [content,setContent]=useState<Content|null>(null),[channel,setChannel]=useState<keyof Content>('target_1_blog');
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const [photo,setPhoto]=useState<string>(),[editing,setEditing]=useState(false),[mediaRefresh,setMediaRefresh]=useState(0);
  const refreshImages=useCallback(()=>setMediaRefresh(n=>n+1),[]);
  const library=useMediaLibrary(propertyId,mediaRefresh);
  useEffect(()=>{let active=true;setBusy(true);api<{content:Content}>(`action=marketing&propertyId=${propertyId}`).then(result=>{if(active)setContent(Object.fromEntries(Object.entries(result.content).map(([key,value])=>[key,normalizeCopy(value)])) as Content);}).catch(()=>{if(active){setError(true);setMessage('광고 초안을 불러오지 못했습니다. 초안을 닫고 다시 열어 주세요.');}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[propertyId]);
  async function work(task:()=>Promise<void>){setBusy(true);setError(false);setMessage('');try{await task();}catch(e){setError(true);setMessage(e instanceof Error?e.message:'처리하지 못했습니다.');}finally{setBusy(false);}}
  function download(){if(!content)return;const body=['# Spacepick 광고 초안','검수 전 · 외부 게시 승인 아님',`매물 ID: ${propertyId}`,dirty?'상태: 저장 전 편집본':`상태: 불러온/저장한 초안`,...channels.flatMap(([key,label])=>[`\n## ${label}`,normalizeCopy(content[key])||'생성된 내용 없음'])].join('\n\n');const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`spacepick-${propertyId}-광고초안.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('광고 초안을 파일로 내려받았습니다. 저장 전 편집도 포함됩니다.');}
  return <section className="glass admin-editor marketing-package"><p className="eyebrow">AI CONTENT STUDIO</p><h2>광고 콘텐츠 패키지</h2><p>매물 분석에서 자동 작성된 문구입니다. 블로그 글 2종과 인스타그램 카드뉴스 구성안을 검토하고 준비하세요.</p><div className="admin-toolbar" role="group" aria-label="광고 채널">{channels.map(([key,label])=><button type="button" key={key} className={`button ${channel===key?'button-gold':'button-outline'}`} aria-pressed={channel===key} onClick={()=>setChannel(key)}>{label}</button>)}</div>
    {content?<><label htmlFor={`marketing-${propertyId}`}>{channels.find(([key])=>key===channel)?.[1]} · {content[channel].length.toLocaleString()}자 {dirty?'· 저장 전 변경 있음':''}</label><div className="admin-toolbar"><button type="button" className={`button ${!editing?'button-gold':'button-outline'}`} onClick={()=>setEditing(false)}>완성본 미리보기</button><button type="button" className={`button ${editing?'button-gold':'button-outline'}`} disabled={busy||locked} onClick={()=>setEditing(true)}>글 편집</button><button type="button" className="button button-outline" onClick={refreshImages}>자료 새로고침</button></div>{!editing&&channel!=='insta_caption'&&<BlogPreview text={content[channel]} images={library.images}/>} {editing&&<textarea id={`marketing-${propertyId}`} style={{minHeight:380,lineHeight:1.8}} maxLength={18000} disabled={busy||locked} value={content[channel]} placeholder="생성된 내용이 없습니다. 확인된 자료를 바탕으로 작성해 주세요." onChange={e=>{setContent({...content,[channel]:e.target.value});setDirty(true);}}/>}<p>AI 초안 · 사실·권리·연락처를 확인한 뒤 사용하세요. 인스타그램 탭에서 카드뉴스 이미지 5장을 확인할 수 있습니다.</p><div className="admin-toolbar"><button type="button" className="button button-gold" disabled={busy||locked||!dirty} onClick={()=>void work(async()=>{const result=await api<{revision:number}>('','PATCH',{action:'save-marketing',propertyId,revision,content});onSaved(result.revision);setDirty(false);setMessage('광고 초안을 비공개로 저장했습니다.');})}>{busy?'처리 중…':'광고 초안 저장'}</button><button type="button" className="button button-outline" disabled={busy||!content[channel]} onClick={()=>void work(async()=>{await navigator.clipboard.writeText(normalizeCopy(content[channel]));setMessage('선택한 채널의 문구를 복사했습니다.');})}>선택 문구 복사</button><button type="button" className="button button-outline" disabled={busy} onClick={download}>전체 패키지 내려받기</button></div></>:busy?<p role="status">광고 초안을 불러오는 중…</p>:null}
    {library.loading&&<p role="status">제공 사진과 생성 이미지를 불러오는 중…</p>}{library.error&&<p role="alert">{library.error}</p>}{content&&channel==='insta_caption'&&<CardNews caption={content.insta_caption} propertyId={propertyId} dirty={dirty} photo={photo} photos={library.images}/>}
    {content&&<ImageStudio propertyId={propertyId} concepts={concepts} onImagesChanged={refreshImages}/>}
    {content&&<PropertyMedia propertyId={propertyId} onPhoto={setPhoto} onChanged={refreshImages}/>}
    {message&&<p role={error?'alert':'status'} className={error?'admin-error':''}>{message}</p>}<p>쇼룸 승인과 별도로 검토할 광고 초안입니다. 채널 예약·발행은 다음 단계에서 연결합니다.</p></section>;
}
