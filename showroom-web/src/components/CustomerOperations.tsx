import {operationalFacts} from '../lib/customerReview';
import {evidenceLabels,factEvidenceLabel,type Fact} from '../types/showroom';
export function CustomerOperations({facts}:{facts:Fact[]}){
 const {current,proposals}=operationalFacts(facts);if(!current.length&&!proposals.length)return null;
 const rows=(items:Fact[])=>items.map((fact,i)=><div className="operation-entry" key={`${fact.key}-${i}`}><dt>{fact.label}</dt><dd>{typeof fact.value==='number'?fact.value.toLocaleString('ko-KR'):fact.value}{fact.unit&&` ${fact.unit}`}<span className={`evidence-tag evidence-${fact.evidence}`}>{factEvidenceLabel(fact)}</span><p className="fact-source">{fact.source}</p>{fact.publication==='private'&&<small>비공개 · 초안에서만 표시</small>}</dd></div>);
 return <section id="customer-operations" className="section-shell customer-operations"><div className="section-top"><div><p className="eyebrow">USE & OPERATING CONDITIONS</p><h2>현재 이용과 임대·운영 조건</h2><p className="section-description">기재된 임대료는 순수익이 아닙니다. 계약 원문·만기·공실·운영비를 함께 확인하세요.</p></div></div>
  <div className="operations-grid">{!!current.length&&<article className="glass property-terms"><h3>제공된 현황·계약 정보</h3><dl>{rows(current)}</dl></article>}{!!proposals.length&&<article className="glass property-terms"><h3>제안·예상 조건</h3><p>체결된 계약이나 확정 수익으로 합산하지 않습니다.</p><dl>{rows(proposals)}</dl></article>}</div>
  <p className="section-description">기준일과 변경 여부는 담당자에게 확인하세요. 미제공된 비용이나 계약 종료일을 추정해 채우지 않습니다.</p>
 </section>;
}
