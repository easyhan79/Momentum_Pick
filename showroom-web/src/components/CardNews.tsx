import {useEffect,useMemo,useRef,useState} from 'react';
import type {LibraryImage} from '../lib/useMediaLibrary';
import {drawNewsCard,parseNewsCards,type NewsCard} from '../lib/cardNews';

function Card({card,propertyId,photo,photoLabel}:{card:NewsCard;propertyId:string;photo?:string;photoLabel?:string}){
  const ref=useRef<HTMLCanvasElement>(null),[ready,setReady]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;setReady(false);setMessage('');void (async()=>{await document.fonts.ready;let image:HTMLImageElement|undefined;if(photo){image=new Image();image.src=photo;await image.decode();}if(active&&ref.current)setReady(drawNewsCard(ref.current,card,image,photoLabel));})().catch(()=>{if(active)setMessage('배경 사진을 불러오지 못했습니다. 사진을 다시 선택하거나 배경을 해제해 주세요.');});return()=>{active=false;};},[card,photo,photoLabel]);
  async function download(){
    try{const canvas=ref.current;if(!canvas||!ready)return;const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error()),'image/png'));const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`spacepick-${propertyId}-card-${card.number}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage(`${card.number}번 PNG를 내려받았습니다.`);}catch{setMessage('이미지를 저장하지 못했습니다. 다시 시도해 주세요.');}
  }
  return <article style={{minWidth:0}}><canvas ref={ref} role="img" aria-label={`${card.number}번 카드: ${card.body}`} style={{width:'100%',height:'auto',borderRadius:12,display:'block'}}/><button type="button" className="button button-outline" style={{width:'100%',marginTop:12}} disabled={!ready} onClick={()=>void download()}>{card.number}번 PNG 내려받기</button>{!ready&&<p>문구가 길면 구성안에서 줄여 주세요.</p>}{message&&<p role="status">{message}</p>}</article>;
}
export function CardNews({caption,propertyId,dirty,photo,photos=[]}:{caption:string;propertyId:string;dirty:boolean;photo?:string;photos?:LibraryImage[]}){
  const cards=useMemo(()=>parseNewsCards(caption),[caption]);
  const backgrounds=photos.filter(p=>p.source_type==='ai_generated');
  return <section style={{marginTop:32}} aria-label="카드뉴스 이미지 작업실"><p className="eyebrow">CAROUSEL / 1080 × 1350</p><h3>카드뉴스 이미지 5장</h3><p>위 구성안으로 이미지가 자동 조판됩니다. {dirty?'저장 전 편집 내용이 반영됩니다. ':'저장된 광고 초안을 사용합니다. '}각 PNG를 내려받아 검토하세요.</p>{cards.length?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:20}}>{cards.map(card=><Card key={card.number} card={card} propertyId={propertyId} photo={photo||backgrounds[(card.number-1)%Math.max(1,backgrounds.length)]?.url} photoLabel={photo?'제공 자료 기반':backgrounds[(card.number-1)%Math.max(1,backgrounds.length)]?.source_type==='ai_generated'?'AI 활용 예시 · 실제 사진 아님':'제공 자료 기반'}/>)}</div>:<p role="status">구성안에 [카드 1]부터 [카드 5]까지 순서대로 내용을 넣으면 이미지가 표시됩니다. 누락된 내용은 임의로 만들지 않습니다.</p>}<p>자료 출처와 AI 이미지 구분 표시가 포함됩니다. {backgrounds.length?'대표·컨셉 생성 이미지를 순서대로 재사용합니다.':'이미지가 준비되면 생성 이미지를 자동 배치합니다.'} 외부에 자동 게시하지 않습니다.</p></section>;
}
