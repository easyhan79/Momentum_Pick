import type {Fact} from '../types/showroom';import {factEvidenceLabel} from '../types/showroom';
export function BuildingRentRoll({facts}:{facts:Fact[]}){
 const rows=facts.filter(f=>f.key==='rent_roll'&&f.value!==null&&String(f.value).trim()&&['provided','verified'].includes(f.status||'')&&f.publication!=='private');
 if(!rows.length)return null;
 return <section id="building-rent-roll" className="section-shell"><p className="eyebrow">PROVIDED LEASE RECORDS</p><h2>제공된 층별 임대 현황</h2><p>공개 허용된 실제 제공 기록만 표시합니다. 미제공 층·공실과 임대료 합계를 추정하지 않습니다.</p><div className="decision-card-grid">{rows.map((f,i)=><article className="glass decision-card" key={i}><h3>{f.label}</h3><p>{f.value}{f.unit&&` ${f.unit}`}</p><span>{factEvidenceLabel(f)}</span><p>{f.source} · 기준일 {f.asOf||'미제공'}</p></article>)}</div><p>계약기간·승계·보증금·운영비는 원자료와 대조하세요. 임대료는 순수익이나 확정 수익률이 아닙니다.</p></section>;
}
