import { useEffect, useState } from 'react';
import {mediaRequest} from '../lib/adminApi';
import { ArrowUpRight, MousePointer2, ScanLine } from 'lucide-react';
import { evidenceLabels, type Concept } from '../types/showroom';

export function ZoneMap({ concept, propertyId, privatePreview=false }: { concept: Concept; propertyId?:string; privatePreview?:boolean }) {
  const [planUrl,setPlanUrl]=useState(''),[expanded,setExpanded]=useState(false);
  useEffect(()=>{let active=true,local='';setPlanUrl('');if(concept.plan){if(privatePreview&&propertyId){mediaRequest(`action=image&propertyId=${propertyId}&assetId=${concept.plan.assetId}`).then(r=>r.blob()).then(blob=>{local=URL.createObjectURL(blob);if(active)setPlanUrl(local);else URL.revokeObjectURL(local);}).catch(()=>{});}else if(concept.plan.url)setPlanUrl(concept.plan.url);}return()=>{active=false;if(local)URL.revokeObjectURL(local);};},[concept.plan?.assetId,concept.plan?.url,propertyId,privatePreview]);
  const zones = concept.zones.slice(0, 5);
  const [selectedId, setSelectedId] = useState(zones[0]?.id ?? '');
  const active = zones.find(zone => zone.id === selectedId) ?? zones[0];
  const indoor = zones.filter(zone => zone.indoorOutdoor !== 'outdoor');
  const outdoor = zones.filter(zone => zone.indoorOutdoor === 'outdoor');
  return <div id="concept-panel" role="tabpanel" aria-labelledby={`tab-${concept.id}`} className="concept-layout" tabIndex={0}>
    <div className="zone-map glass">
      <div className="map-toolbar"><span><ScanLine size={16} /> CONCEPT ZONING</span><span><MousePointer2 size={13} /> 번호를 선택해 보세요</span></div>
      {concept.plan ? <><div className="plan-viewport"><div className="plan-surface" style={expanded?{width:'180%'}:{}}>{planUrl?<img src={planUrl} alt={concept.plan.caption} onError={()=>setPlanUrl('')}/>:<p role="status">도면을 표시할 수 없습니다. 자료를 다시 확인해 주세요.</p>}{planUrl&&zones.map((z,i)=>z.position&&<button type="button" key={z.id} className={`plan-pin ${active?.id===z.id?'active':''}`} style={{left:`${z.position.x}%`,top:`${z.position.y}%`}} onClick={()=>setSelectedId(z.id)} aria-label={`${i+1}번 ${z.label}`} aria-pressed={active?.id===z.id}>{i+1}</button>)}</div></div><button type="button" className="button button-outline" onClick={()=>setExpanded(!expanded)}>{expanded?'도면 맞춤 보기':'도면 확대'}</button><p>{concept.plan.caption}</p></> : zones.length ? <div className={`blueprint ${outdoor.length ? '' : 'site-blueprint'}`} aria-label="실측 도면이 아닌 개념 조닝">
        <div className="blueprint-indoor"><div className="plan-heading"><span>{outdoor.length ? 'INDOOR' : 'SPACE PLAN'}</span><span>개념 배치 · 비실측</span></div><div className="zone-tiles">{indoor.map(zone => {
          const index = zones.indexOf(zone);
          return <button className={`zone-tile ${zone.id === active?.id ? 'active' : ''}`} key={zone.id} onClick={() => setSelectedId(zone.id)} aria-pressed={zone.id === active?.id} data-zone-index={index}><span className="hotspot">{index + 1}</span><strong>{zone.label}</strong>{zone.sub && <small>{zone.sub}</small>}</button>;
        })}</div><span className="plan-edge">동선 · 출입구 위치 확인 필요</span></div>
        {outdoor.length > 0 && <div className="blueprint-outdoor"><div className="plan-heading"><span>TERRACE</span><span>사용권 미확인</span></div><div className="zone-tiles">{outdoor.map(zone => {
          const index = zones.indexOf(zone);
          return <button className={`zone-tile ${zone.id === active?.id ? 'active' : ''}`} key={zone.id} onClick={() => setSelectedId(zone.id)} aria-pressed={zone.id === active?.id} data-zone-index={index}><span className="hotspot">{index + 1}</span><strong>{zone.label}</strong>{zone.sub && <small>{zone.sub}</small>}</button>;
        })}</div></div>}
      </div> : <div className="empty-section">제공된 존 정보가 없습니다. 실제 도면 확인 후 검토합니다.</div>}
      <div className="map-footer"><span className="evidence-tag">{concept.plan?'제공 도면 · 실측·인허가 확인 필요':'개념도 · 실측 도면 아님'}</span><span>면적·비율·위치는 실제와 다를 수 있습니다.</span></div>
    </div>
    <div className="concept-detail glass">
      <div className="detail-top"><span className="evidence-tag evidence-ai_hypothesis">활용 가설</span><span className="small-label">적법성 별도 검토</span></div>
      <h3>{concept.headline}</h3><p className="concept-rationale">{concept.rationale}</p>
      {active ? <div className="active-zone" aria-live="polite"><div className="active-zone-heading"><span className="hotspot">{zones.indexOf(active) + 1}</span><span className="small-label">SPACE FOCUS</span></div><span className="evidence-tag">{evidenceLabels[active.evidence||'ai_hypothesis']}</span><h4>{active.title}</h4><p>{active.body || '상세 자료 확인 필요. 제공된 구역명만 표시합니다.'}</p>{active.metric && <div className="zone-metric"><span>{active.metric.label}</span><strong>{active.metric.value}</strong><small>{evidenceLabels[active.metric.evidence]} · {active.metric.source}</small></div>}</div> : <div className="active-zone"><p>존 자료 확인 필요</p></div>}
      <div className="detail-bottom"><span>사용 조건을 확인한 뒤 구체화합니다.</span><a href="#evidence" aria-label="검토 항목으로 이동"><ArrowUpRight size={20} /></a></div>
    </div>
  </div>;
}
