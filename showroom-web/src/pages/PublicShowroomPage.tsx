import {useEffect,useState} from 'react';
import type {Showroom} from '../types/showroom';
import {ShowroomPage} from './ShowroomPage';
export function PublicShowroomPage({slug}:{slug:string}){
 const [closed,setClosed]=useState(false),[canonical,setCanonical]=useState(slug);
 const [data,setData]=useState<Showroom|null>(null),[message,setMessage]=useState('승인된 매물을 불러오는 중입니다.');
 useEffect(()=>{let active=true;let pending:AbortController|null=null;
 async function load(){pending?.abort();const controller=new AbortController();pending=controller;setClosed(false);setMessage('승인된 매물을 불러오는 중입니다.');
 try{const config=await fetch('/supabase-public.json',{cache:'no-store',signal:controller.signal}).then(r=>r.json());const r=await fetch(`https://aklcylhqslgntkgloqpi.supabase.co/functions/v1/public-showroom?slug=${encodeURIComponent(slug)}`,{headers:{apikey:config.publishableKey},cache:'no-store',signal:controller.signal});if(!active||controller.signal.aborted)return;if(!r.ok){setData(null);setMessage(r.status===404?'현재 볼 수 없는 매물입니다.':'매물을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');return;}const result=await r.json();if(active&&!controller.signal.aborted){setClosed(result.closed===true);setCanonical(result.canonical_slug||slug);setData(result.showroom||null);document.title=result.closed?'거래 완료 | Spacepick':`${result.showroom?.title||'매물 안내'} | Spacepick`;}
 }catch{if(active&&!controller.signal.aborted){setData(null);setMessage('매물을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');}}}
 void load();const timer=setInterval(()=>{if(!document.hidden)void load()},30000);const focus=()=>{if(!document.hidden)void load()};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);return()=>{active=false;pending?.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)};
 },[slug]);
 return closed?<main className="admin-shell"><a className="brand-word" href="/">SPACEPICK</a><h1>거래가 완료된 매물입니다.</h1><p>이 주소는 거래 완료 안내로 유지됩니다. 신규 문의 접수는 마감되었습니다.</p><a className="button button-gold" href="/">Spacepick 서비스 보기</a></main>:data?<ShowroomPage key={slug} data={data} selector={<span>관리자 승인본 · 정보와 이용 조건은 별도 확인이 필요합니다.</span>} published inquirySlug={canonical} />:<main className="admin-shell"><a href="/" className="brand-word">SPACEPICK</a><h1>매물 안내</h1><p role="status">{message}</p></main>;
}
