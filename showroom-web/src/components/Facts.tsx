import { CircleHelp } from 'lucide-react';
import { evidenceLabels, type Fact } from '../types/showroom';
import { hasFactValue } from '../lib/industrialReview';

export function Facts({ facts }: { facts: Fact[] }) {
  return <section id="facts" className="section-shell facts-section" aria-labelledby="facts-title">
    <div className="section-top compact"><div><p className="eyebrow">01 / PROPERTY FACTS</p><h2 id="facts-title">공간을 이해하는 기본 정보</h2></div><p className="section-note"><CircleHelp size={14} /> 제공정보는 공식 자료와 대조가 필요합니다.</p></div>
    <div className="facts-grid">{facts.map((fact,index) => <article className="fact-card glass" key={`${fact.key}-${index}`}>
      <p className="small-label">{fact.label}</p>
      <p className={`fact-value ${!hasFactValue(fact.value) ? 'unknown-value' : ''}`}>{hasFactValue(fact.value) ? fact.value : '확인 필요'}{hasFactValue(fact.value) && fact.unit && <span>{fact.unit}</span>}</p>
      <span className={`evidence-tag evidence-${fact.evidence}`}>{evidenceLabels[fact.evidence]}</span>
      <p className="fact-source">{fact.source}</p>{fact.publication==='private'&&<span className="evidence-tag">비공개 항목 · 초안에서만 표시</span>}
    </article>)}</div>
  </section>;
}
