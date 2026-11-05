import { useEffect, useState } from 'react';
import {mediaRequest} from '../lib/adminApi';
import { ArrowUpRight, MousePointer2, ScanLine } from 'lucide-react';
import { evidenceLabels, type Concept, type Asset } from '../types/showroom';

export function ZoneMap({ concept, propertyId, privatePreview=false, illustration }: { illustration?:Asset; concept: Concept; propertyId?:string; privatePreview?:boolean }) {
  const [planUrl,setPlanUrl]=useState(''),[expanded,setExpanded]=useState(false);
  useEffect(()=>{let active=true,local='';setPlanUrl('');if(concept.plan){if(privatePreview&&propertyId){mediaRequest(`action=image&propertyId=${propertyId}&assetId=${concept.plan.assetId}`).then(r=>r.blob()).then(blob=>{local=URL.createObjectURL(blob);if(active)setPlanUrl(local);else URL.revokeObjectURL(local);}).catch(()=>{});}else if(concept.plan.url)setPlanUrl(concept.plan.url);}return()=>{active=false;if(local)URL.revokeObjectURL(local);};},[concept.plan?.assetId,concept.plan?.url,propertyId,privatePreview]);
  const generated = !concept.plan && illustration?.generated;
  const surfaceUrl = concept.plan ? planUrl : generated ? illustration?.url : '';
  const caption = concept.plan?.caption || 'AI 공간 활용 구상도 · 실제 배치 및 인허가 미확인';
  const zones = concept.zones.slice(0, 5);
  const [selectedId, setSelectedId] = useState(zones[0]?.id ?? '');
  const active = zones.find(zone => zone.id === selectedId) ?? zones[0];
  return <div id="concept-panel" role="tabpanel" aria-labelledby={`tab-${concept.id}`} className="concept-layout" tabIndex={0}>
    <div className="zone-map glass">
      <div className="map-toolbar"><span><ScanLine size={16} /> CONCEPT ZONING</span><span><MousePointer2 size={13} /> 번호를 선택해 보세요</span></div>
      {concept.plan || generated ? <><div className="plan-viewport"><div className="plan-surface" style={expanded?{width:'180%'}:{}}>{surfaceUrl?<img src={surfaceUrl} alt={caption} onError={()=>setPlanUrl('')}/>:<p role="status">도면을 표시할 수 없습니다. 자료를 다시 확인해 주세요.</p>}{surfaceUrl&&zones.map((zone,i)=>{const z={...zone,position:concept.plan?zone.position:illustration?.zoning?.find(p=>p.zoneId===zone.id)||[{x:27,y:28},{x:73,y:28},{x:27,y:62},{x:73,y:62},{x:50,y:84}][i]};return z.position&&<button type="button" key={z.id} className={`plan-pin ${active?.id===z.id?'active':''}`} style={{left:`${z.position.x}%`,top:`${z.position.y}%`}} onClick={()=>setSelectedId(z.id)} aria-label={`${i+1}번 ${z.label}`} aria-pressed={active?.id===z.id}>{i+1}</button>;})}</div></div><button type="button" className="button button-outline" onClick={()=>setExpanded(!expanded)}>{expanded?'도면 맞춤 보기':'도면 확대'}</button><p>{caption}</p>{generated&&!illustration?.zoning?.length&&<p>번호는 활용 설명을 위한 가상 위치입니다. 새로 생성하는 구상도부터 구역 배치를 반영합니다.</p>}</> : <div className="generated-map-empty"><ScanLine size={36}/><h3>공간 활용 구상도 준비</h3><p>매물 분석을 바탕으로 컨셉별 이미지를 생성하면 이곳에 구역 번호와 함께 표시됩니다.</p><div className="admin-toolbar">{zones.map((z,i)=><button type="button" className={`button ${active?.id===z.id?'button-gold':'button-outline'}`} key={z.id} onClick={()=>setSelectedId(z.id)}>{i+1}. {z.label}</button>)}</div></div>}

      <div className="map-footer"><span className="evidence-tag">{concept.plan?'제공 도면 · 실측·인허가 확인 필요':'AI 공간 활용 구상도 · 실제 배치 및 인허가 미확인'}</span><span>면적·비율·위치는 실제와 다를 수 있습니다.</span></div>
    </div>
    <div className="concept-detail glass">
      <div className="detail-top"><span className="evidence-tag evidence-ai_hypothesis">활용 가설</span><span className="small-label">적법성 별도 검토</span></div>
      <h3>{concept.headline}</h3><p className="concept-rationale">{concept.rationale}</p>
      {active ? <div className="active-zone" aria-live="polite"><div className="active-zone-heading"><span className="hotspot">{zones.indexOf(active) + 1}</span><span className="small-label">SPACE FOCUS</span></div><span className="evidence-tag">{evidenceLabels[active.evidence||'ai_hypothesis']}</span><h4>{active.title}</h4><p>{active.body || '상세 자료 확인 필요. 제공된 구역명만 표시합니다.'}</p>{active.metric && <div className="zone-metric"><span>{active.metric.label}</span><strong>{active.metric.value}</strong><small>{evidenceLabels[active.metric.evidence]} · {active.metric.source}</small></div>}</div> : <div className="active-zone"><p>존 자료 확인 필요</p></div>}
      <div className="detail-bottom"><span>사용 조건을 확인한 뒤 구체화합니다.</span><a href="#evidence" aria-label="검토 항목으로 이동"><ArrowUpRight size={20} /></a></div>
    </div>
  </div>;
}
