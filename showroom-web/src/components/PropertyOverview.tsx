import {evidenceLabels,type Showroom} from '../types/showroom';

export function PropertyOverview({summary,highlights}:{summary?:Showroom['propertySummary'];highlights?:Showroom['highlights']}){
  if(!summary&&!highlights?.length)return null;
  const money=(value:number|null)=>value===null?'확인 필요':`${value.toLocaleString('ko-KR')}원`;
  return <section id="property-overview" className="section-shell property-overview" aria-labelledby="property-overview-title">
    <div className="section-top"><div><p className="eyebrow">PROPERTY / DECISION</p><h2 id="property-overview-title">거래조건과 주요 검토 이유</h2><p className="section-description">제공된 조건과 근거를 확인하고, 실제 이용 가능 여부는 별도로 검토하세요.</p></div></div>
    {summary&&<div className="glass property-terms"><h3>{summary.transaction==='sale'?'매매 조건':summary.transaction==='lease'?'임대 조건':'거래방식 확인 필요'}</h3>
      {summary.price.status==='negotiable'?<p>가격 협의</p>:summary.price.status==='unknown'?<p>가격 확인 필요</p>:summary.transaction==='sale'?<p>매매가격 {money(summary.price.saleWon)}</p>:summary.transaction==='lease'?<p>보증금 {money(summary.price.depositWon)} · 월세 {money(summary.price.monthlyWon)}</p>:<p>거래방식 확인 필요</p>}
      <span className="evidence-tag evidence-owner_provided">관리자 제공조건 · 실계약 확인 필요</span>
    </div>}
    {!!highlights?.length&&<div className="property-highlights">{highlights.map((highlight,index)=><article key={index} className="glass property-highlight">
      <span className="small-label">검토 이유 {index+1}</span><h3>{highlight.title}</h3><p>{highlight.description}</p>
      <ul>{highlight.references.map((fact,i)=><li key={`${fact.key}-${i}`}><strong>{fact.label}: {fact.value}{fact.unit&&` ${fact.unit}`}</strong><span className={`evidence-tag evidence-${fact.evidence}`}>{evidenceLabels[fact.evidence]}</span><p className="fact-source">{fact.source}</p></li>)}</ul>
      {highlight.constraints&&<p className="section-description">제약·확인사항: {highlight.constraints}</p>}
    </article>)}</div>}
  </section>;
}
