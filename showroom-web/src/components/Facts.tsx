import { CircleHelp } from 'lucide-react';
import { evidenceLabels, type Fact } from '../types/showroom';

export function Facts({ facts }: { facts: Fact[] }) {
  return <section id="facts" className="section-shell facts-section" aria-labelledby="facts-title">
    <div className="section-top compact"><div><p className="eyebrow">01 / PROPERTY FACTS</p><h2 id="facts-title">공간을 이해하는 기본 정보</h2></div><p className="section-note"><CircleHelp size={14} /> 제공정보는 공식 자료와 대조가 필요합니다.</p></div>
    <div className="facts-grid">{facts.map(fact => <article className="fact-card glass" key={fact.key}>
      <p className="small-label">{fact.label}</p>
      <p className={`fact-value ${fact.value == null ? 'unknown-value' : ''}`}>{fact.value ?? '확인 필요'}{fact.value != null && fact.unit && <span>{fact.unit}</span>}</p>
      <span className={`evidence-tag evidence-${fact.evidence}`}>{evidenceLabels[fact.evidence]}</span>
      <p className="fact-source">{fact.source}</p>
    </article>)}</div>
  </section>;
}
