import {useState} from 'react';
import type {Showroom} from '../types/showroom';
import {briefFromStrategy,briefTones,targetOptions,type Brief,type BriefPoint,type BriefTone} from '../../../supabase/functions/_shared/brief.ts';
import {coreAreaFields} from '../../../supabase/functions/_shared/property-profile.ts';
import {formatArea,formatWon} from '../lib/units';

type Props={content:Showroom;busy:boolean;dirty:boolean;onChange:(content:Showroom)=>void;onSave:()=>void;onProceed:()=>void;onEditFacts:()=>void};
const transactionLabels:Record<string,string>={sale:'매매',lease:'임대',unknown:'미정'};

// 확인 1: the admin checks the four core facts and the content brief once; everything after follows the brief.
export function BriefConfirm({content,busy,dirty,onChange,onSave,onProceed,onEditFacts}:Props){
  const proposal=briefFromStrategy(content.salesStrategy);
  const brief:Brief=content.brief||proposal;
  const status=!content.brief?'AI 분석 제안 · 아직 저장 전':dirty?'저장 전 수정 있음':'저장됨';
  const options=targetOptions(content.salesStrategy);
  const unused=proposal.points.filter(p=>!brief.points.some(b=>b.fact===p.fact));
  const [customTarget,setCustomTarget]=useState(!!brief.target&&!options.some(o=>o.label===brief.target));
  const set=(patch:Partial<Brief>)=>onChange({...content,brief:{...brief,...patch}});
  const setPoint=(i:number,patch:Partial<BriefPoint>)=>set({points:brief.points.map((p,j)=>j===i?{...p,...patch}:p)});
  const move=(i:number,d:number)=>{const points=[...brief.points];const [p]=points.splice(i,1);points.splice(i+d,0,p);set({points});};

  const profile=content.propertyProfile,price=profile?.price,area=profile?coreAreaFields(profile)[0]:undefined,contact=content.registration?.contact;
  const priceText=!price||price.status==='unknown'?'':price.status==='negotiable'?'가격 협의':profile?.transaction==='lease'?`보증금 ${formatWon(price.depositWon)} · 월세 ${formatWon(price.monthlyWon)}`:formatWon(price.saleWon);
  const facts:[string,string][]=[
    ['소재지',content.address?.trim()||''],
    ['거래방식·가격',profile&&profile.transaction!=='unknown'&&priceText?`${transactionLabels[profile.transaction]} · ${priceText}`:''],
    ['면적',area&&typeof area.value==='number'?formatArea(area.value):''],
    ['담당자 연락처',contact?.name&&contact?.phone?`${contact.name} · ${contact.phone}`:''],
  ];
  const missing=facts.filter(([,v])=>!v).length;

  return <section id="brief-confirm" className="glass admin-editor brief-confirm">
    <p className="eyebrow">STEP 2 / 기획 확인</p>
    <h2>기획 확인</h2>
    <p>여기서 한 번만 확인하면, 쇼룸 글·블로그·카드뉴스·이미지가 모두 이 기획서에 맞춰 만들어집니다.</p>

    <h3>필수 사실 4가지</h3>
    <ul className="brief-facts">{facts.map(([label,value])=><li key={label} className={value?'':'brief-missing'}><span>{label}</span><strong>{value||'입력 필요'}</strong></li>)}</ul>
    {missing>0&&<p role="status">{missing}개 항목이 비어 있습니다. 게시 전에 채워 주세요.</p>}
    <button type="button" className="button button-outline" onClick={onEditFacts}>사실정보 수정</button>

    <h3>기획서 <small>{status}</small></h3>
    {!content.salesStrategy&&!content.brief&&<p role="status">AI 분석 결과가 아직 없습니다. 「① 입력·자료」에서 분석을 요청하거나 아래를 직접 채워 주세요.</p>}

    <label htmlFor="brief-target">타깃 고객</label>
    {options.length>0&&!customTarget
      ?<select id="brief-target" value={brief.target} disabled={busy} onChange={e=>{if(e.target.value==='__custom'){setCustomTarget(true);set({target:''});}else set({target:e.target.value});}}>
        {options.map(o=><option key={o.label} value={o.label}>{o.label}</option>)}<option value="__custom">직접 입력…</option></select>
      :<input id="brief-target" maxLength={100} disabled={busy} value={brief.target} placeholder="예: 테라스 카페를 찾는 창업자" onChange={e=>set({target:e.target.value})}/>}
    {options.find(o=>o.label===brief.target)?.rationale&&<small>{options.find(o=>o.label===brief.target)!.rationale}</small>}

    <h4>핵심 장점 · 최대 3개 (이 순서로 강조합니다)</h4>
    <ol className="brief-points">{brief.points.map((p,i)=><li key={i}>
      <label>장점<input maxLength={300} disabled={busy} value={p.fact} onChange={e=>setPoint(i,{fact:e.target.value})}/></label>
      <label>고객에게 주는 이점<input maxLength={300} disabled={busy} value={p.buyerBenefit} onChange={e=>setPoint(i,{buyerBenefit:e.target.value})}/></label>
      <small>근거: {p.source||'직접 입력'}</small>
      <div className="admin-toolbar">
        <button type="button" className="button button-outline" disabled={busy||i===0} onClick={()=>move(i,-1)} aria-label={`${i+1}번 장점 위로`}>↑</button>
        <button type="button" className="button button-outline" disabled={busy||i===brief.points.length-1} onClick={()=>move(i,1)} aria-label={`${i+1}번 장점 아래로`}>↓</button>
        <button type="button" className="button button-outline" disabled={busy} onClick={()=>set({points:brief.points.filter((_,j)=>j!==i)})}>빼기</button>
      </div>
    </li>)}</ol>
    {brief.points.length<3&&<div className="admin-toolbar">
      {unused.map(p=><button type="button" key={p.fact} className="button button-outline" disabled={busy} onClick={()=>set({points:[...brief.points,p]})}>+ {p.fact}</button>)}
      <button type="button" className="button button-outline" disabled={busy} onClick={()=>set({points:[...brief.points,{fact:'',buyerBenefit:'',source:''}]})}>+ 직접 추가</button>
    </div>}

    <fieldset className="brief-tone"><legend>글 톤</legend>{(Object.entries(briefTones) as [BriefTone,string][]).map(([key,label])=><label key={key}><input type="radio" name="brief-tone" checked={brief.tone===key} disabled={busy} onChange={()=>set({tone:key})}/>{label}</label>)}</fieldset>

    <label htmlFor="brief-avoid">주의·피할 표현 · 선택</label>
    <textarea id="brief-avoid" maxLength={500} disabled={busy} value={brief.avoid} onChange={e=>set({avoid:e.target.value})} placeholder="예: 권리금 조건은 확인 전이라 언급하지 않기"/>

    <div className="admin-toolbar">
      <button type="button" className="button button-outline" disabled={busy} onClick={()=>{if(!content.brief)onChange({...content,brief});onSave();}}>기획서 저장</button>
      <button type="button" className="button button-gold" disabled={busy||brief.points.some(p=>!p.fact.trim())} onClick={onProceed}>이대로 진행 · 글 다시 쓰기</button>
    </div>
    <p>「이대로 진행」을 누르면 기획서를 저장하고, 쇼룸 제목·요약, 블로그 2개, 카드뉴스 문구를 이 기획서에 맞춰 다시 씁니다. 결과는 「③ 미리보기·게시」에서 기존 글과 비교한 뒤 적용합니다.</p>
  </section>;
}
