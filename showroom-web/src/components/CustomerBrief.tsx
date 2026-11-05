import {briefGroups,matchingFacts} from '../lib/customerReview';
import type {ReviewKind} from '../lib/propertyReview';
import {evidenceLabels,type Fact,type Showroom} from '../types/showroom';

export function CustomerBrief({facts,kind,summary}:{facts:Fact[];kind:ReviewKind;summary?:Showroom['propertySummary']}){
 return <section id="customer-brief" className="section-shell customer-brief" aria-labelledby="customer-brief-title">
  <div className="section-top"><div><p className="eyebrow">PROPERTY AT A GLANCE</p><h2 id="customer-brief-title">검토에 필요한 조건을 먼저 보세요.</h2><p className="section-description">제공된 매물 조건을 모았습니다. 자세한 출처와 이용 조건은 아래에서 확인할 수 있습니다.</p></div><a href="#evidence" className="button button-outline">확인할 자료 살펴보기</a></div>
  {summary&&<p className="brief-deal">{summary.transaction==='sale'?'매매 검토':summary.transaction==='lease'?'임대 검토':'거래방식 확인 필요'} · {summary.price.status==='negotiable'?'가격 협의':summary.price.status==='unknown'?'금액 확인 필요':'입력된 거래조건은 아래 상세 참조'}</p>}
  <div className="customer-brief-grid">{briefGroups(kind).map(group=>{const items=matchingFacts(facts,group.keys);return <article className="glass customer-brief-card" key={group.title}><h3>{group.title}</h3>
    {items.length?<dl>{items.slice(0,4).map((fact,i)=><div key={`${fact.key}-${i}`}><dt>{fact.label}</dt><dd>{typeof fact.value==='number'?fact.value.toLocaleString('ko-KR'):fact.value}{fact.unit&&` ${fact.unit}`}<small>{evidenceLabels[fact.evidence]}{fact.publication==='private'?' · 비공개 초안':''}</small></dd></div>)}</dl>:<p className="brief-missing">아직 제공된 조건이 없습니다.<br/><a href="#evidence">필요한 자료 확인하기 ↗</a></p>}
    {items.length>4&&<a href="#facts">나머지 {items.length-4}개 조건과 출처 보기</a>}
  </article>;})}</div>
 </section>;
}
