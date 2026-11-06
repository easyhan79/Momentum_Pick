import {BuildingRentRoll} from '../components/BuildingRentRoll';
import {VisualEvidence} from '../components/VisualEvidence';
import {DecisionCards} from '../components/DecisionCards';
import {decisionCards,publicDecision} from '../../../supabase/functions/_shared/customer-decision.ts';
import {visibleField} from '../../../supabase/functions/_shared/property-profile.ts';
import {CustomerPurpose} from '../components/CustomerPurpose';
import {useCustomerPurpose} from '../lib/useCustomerPurpose';
import {orderConcepts,rankByKeys,slotsFor} from '../../../supabase/functions/_shared/customer-purpose.ts';
import {PropertyOverview} from '../components/PropertyOverview';
import {CustomerBrief} from '../components/CustomerBrief';
import {CustomerOperations} from '../components/CustomerOperations';
import {RentalScenarioView} from '../components/RentalScenarioView';
import {PropertyLocation} from '../components/PropertyLocation';
import {profileFacts,publicProfileHighlights,profileSummary} from '../../../supabase/functions/_shared/property-profile.ts';
import {useMediaLibrary} from '../lib/useMediaLibrary';
import { useEffect,useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';
import type { Showroom } from '../types/showroom';
import { Hero } from '../components/Hero';
import { Facts } from '../components/Facts';
import { ConceptTabs } from '../components/ConceptTabs';
import { ZoneMap } from '../components/ZoneMap';
import { Evidence } from '../components/Evidence';
import { ScenarioCalculator } from '../components/ScenarioCalculator';
import { Gallery } from '../components/Gallery';
import { Inquiry } from '../components/Inquiry';
import { LiveInquiry } from '../components/LiveInquiry';
import {PropertyReview} from '../components/PropertyReview';
import type {ReviewKind} from '../lib/propertyReview';

export function ShowroomPage({ data:sourceData, selector, liveDraft=false, published=false, inquirySlug }: { data: Showroom; selector: React.ReactNode; liveDraft?:boolean;published?:boolean;inquirySlug?:string }) {
  const media=useMediaLibrary(sourceData.id,0,liveDraft);
  const resolve=(asset:NonNullable<Showroom['heroAsset']>)=>({...asset,url:media.images.find(i=>i.id===asset.id)?.url||'',approved:true});
  const data:Showroom=liveDraft?{...sourceData,assets:sourceData.assets.map(resolve),heroAsset:sourceData.heroAsset?resolve(sourceData.heroAsset):undefined}:sourceData;
  const facts=liveDraft&&data.propertyProfile?profileFacts(data.propertyProfile,true):data.facts;
  const highlights=liveDraft&&data.propertyProfile?publicProfileHighlights(data.propertyProfile):data.highlights;
  const summary=liveDraft&&data.propertyProfile?profileSummary(data.propertyProfile):data.propertySummary;
  const customerDecision=liveDraft&&data.propertyProfile?publicDecision(data.propertyProfile,data.propertyProfile.fields):data.customerDecision;
  const rental=liveDraft?data.propertyProfile?.modules?.rentalScenario:data.rentalScenario;
  const kind:ReviewKind=summary?.kind&&summary.kind!=='unknown'?summary.kind:data.category==='industrial'?'industrial':data.category;
  const {purposeId,choose:choosePurpose,purpose}=useCustomerPurpose(data.id,kind,customerDecision?.purposes);
  const concepts = orderConcepts(data.concepts.slice(0,3),purpose);
  const purposeKeys=purpose?.keys||[];
  const orderedFacts=rankByKeys(facts,purposeKeys,f=>[f.key]);
  const [activeId, setActiveId] = useState(concepts[0]?.id ?? '');
  useEffect(()=>setActiveId(concepts[0]?.id||''),[purposeId,data.id]);
  const [shareMessage, setShareMessage] = useState('');
  const [requestedMaterials,setRequestedMaterials]=useState<string[]>([]);
  const [selectedChecks,setSelectedChecks]=useState<{id:string;label:string}[]>([]);
  useEffect(()=>{const allowed=slotsFor(kind,purposeId);setSelectedChecks(current=>current.filter(c=>allowed.some(s=>s.id===c.id)));},[purposeId,data.id,kind]);
  function selectCheck(id:string,label:string,checked:boolean){if(!slotsFor(kind,purposeId).some(s=>s.id===id))return;setSelectedChecks(current=>checked?current.some(c=>c.id===id)||current.length>=12?current:[...current,{id,label}]:current.filter(c=>c.id!==id));}

  function selectMaterial(material:string,checked:boolean){setRequestedMaterials(current=>checked?[...new Set([...current,material])].slice(0,12):current.filter(v=>v!==material));}
  const active = concepts.find(c => c.id === activeId) ?? concepts[0];
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage(published?'Spacepick 매물 링크를 복사했습니다.':'검토용 예시 링크를 복사했습니다.'); }
    catch { setShareMessage('링크를 복사하지 못했습니다. 브라우저 주소를 직접 복사해 주세요.'); }
  }
  return <>
    <div className="preview-banner"><span>{published?'PROPERTY SHOWROOM':'SHOWROOM PREVIEW'}</span> {published?'관리자 승인본 · 고객 문의 접수':'검토용 웹쇼룸 · 실제 매물 공개·문의 접수 전 단계'}</div>
    <header className="site-header"><div className="header-inner"><a className="brand" href="#" aria-label="Spacepick 상단으로"><span className="brand-mark">S<span>↗</span></span><span>SPACE<strong>PICK</strong><small>REAL ESTATE SHOWROOM</small></span></a><nav aria-label="쇼룸 메뉴"><a href="#customer-brief">매물 핵심정보</a><a href="#evidence">확인할 자료</a><a href="#concepts">활용 아이디어</a></nav><div className="header-actions"><button className="share-button" onClick={share} aria-label="쇼룸 링크 복사">{shareMessage.startsWith('링크를 복사했습니다') ? <Check size={17} /> : <Copy size={17} />}</button><a className="button button-gold header-cta" href="#inquiry">{published?'문의하기':'문의 미리보기'} <ArrowUpRight size={16} /></a></div></div></header>
    <main><div className="section-shell fixture-selector">{selector}</div><Hero data={data} kind={kind}/><CustomerPurpose key={data.id} options={customerDecision?.purposes} kind={kind} facts={facts} purposeId={purposeId} onChange={choosePurpose} selectedChecks={selectedChecks.map(c=>c.id)} onCheck={selectCheck}/><CustomerBrief facts={orderedFacts} kind={kind} summary={summary} priorityKeys={purposeKeys}/><PropertyOverview summary={summary} highlights={highlights}/><Facts facts={facts} />
      {kind==='land'&&<PropertyLocation address={data.address} kind={kind}/>}<PropertyReview facts={orderedFacts} kind={kind} priorityKeys={purposeKeys}/>{['factory','industrial','commercial','logistics'].includes(kind)&&<PropertyLocation address={data.address} kind={kind}/>}
      {kind==='income'&&<BuildingRentRoll facts={facts}/>}<CustomerOperations facts={facts}/><DecisionCards decision={customerDecision} rentalAvailable={!!rental?.enabled} purposeId={purposeId} selected={selectedChecks.map(c=>c.id)} onSelect={selectCheck}/>
      {rental?.enabled&&<RentalScenarioView key={`${data.id}:${JSON.stringify(rental)}`} scenario={rental} privatePreview={liveDraft}/>}
      <Evidence unknowns={data.unknowns} facts={orderedFacts} priorityKeys={purposeKeys} kind={kind} selected={requestedMaterials} onSelect={selectMaterial}/>
      <section id="concepts" className="concept-section"><div className="section-shell"><div className="section-top"><div><p className="eyebrow">02 / CONCEPT SIMULATOR</p><h2>하나의 공간, 다른 가능성.</h2><p className="section-description">활용 방향을 선택하고 구역별 아이디어를 살펴보세요.</p></div><span className="evidence-tag evidence-ai_hypothesis">모든 컨셉은 검토 전 가설입니다</span></div>
        {active ? <><ConceptTabs concepts={concepts} activeId={active.id} onSelect={setActiveId} /><ZoneMap key={active.id} concept={active} illustration={data.assets.find(a=>a.approved&&a.generated&&a.conceptId===active.id)} propertyId={data.id} privatePreview={liveDraft} /></> : <div className="empty-section glass"><h3>활용 컨셉 자료 확인 필요</h3><p>확인된 조건이 부족하여 임의의 배치나 업종을 제안하지 않습니다.</p></div>}
      </div></section>
      <VisualEvidence assets={data.assets} concept={active}/><ScenarioCalculator key={data.id} data={data} /><Gallery assets={data.assets} />{data.publicContact&&<aside className="section-shell property-location"><div className="glass property-terms"><h3>매물 담당자</h3><p>{data.publicContact.name} · {data.publicContact.phone}</p></div></aside>}{published&&inquirySlug?<LiveInquiry slug={inquirySlug} requestedTopics={requestedMaterials} inquiryContext={{version:1,propertyId:data.id,purposeId,purposeLabel:customerDecision?.purposes.find(p=>p.id===purposeId)?.label||purpose?.label||'',conceptId:active?.id||'',conceptLabel:active?.conceptName||'',checks:selectedChecks}} onClearTopics={()=>{setRequestedMaterials([]);setSelectedChecks([]);}}/>:liveDraft||published?<section id="inquiry" className="section-shell empty-section"><h2>{published?'문의 접수 준비 중':'비공개 검토 중'}</h2><p>현재 화면에서는 문의를 접수하지 않습니다.</p>{!!requestedMaterials.length&&<ul>{requestedMaterials.map(v=><li key={v}>{v}</li>)}</ul>}</section>:<Inquiry requestedTopics={requestedMaterials} onClearTopics={()=>setRequestedMaterials([])}/>}
    </main>
    <footer className="site-footer section-shell"><div><p className="brand-word">SPACE<span>PICK</span></p><p>공간의 가능성을, 근거와 함께.</p></div><div><p>{published?'자료 기준: 관리자 승인 snapshot':liveDraft?'자료 기준: 등록 매물·AI 분석 결과 · 관리자 검토 전':'자료 기준: 제공 HTML 및 합성 fixtures · 2026.11.02'}</p><p>검토 중 자료입니다. AI 가설은 실제 이용 가능성·수익을 보장하지 않습니다.</p><a href="#">상단으로 ↑</a></div></footer>
    {shareMessage && <div className="share-status" role="status"><p>{shareMessage}</p><button onClick={() => setShareMessage('')} aria-label="링크 안내 닫기">×</button></div>}
  </>;
}
