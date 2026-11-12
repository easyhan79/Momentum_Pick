import {rankByKeys} from '../../../supabase/functions/_shared/customer-purpose.ts';
import {hasFactValue} from '../lib/industrialReview';
import {propertyReview,reviewTitles,type ReviewKind} from '../lib/propertyReview';
import { evidenceLabels,factEvidenceLabel, type Fact } from '../types/showroom';

export function PropertyReview({facts,kind,priorityKeys=[]}:{facts:Fact[];kind:ReviewKind;priorityKeys?:string[]}) {
  const groups=rankByKeys(propertyReview(facts,kind),priorityKeys,g=>g.rows.flatMap(row=>row.entries.map(f=>f.key)));if(!groups.length)return null;
  const industrial=kind==='factory'||kind==='industrial';
  const id=industrial?'industrial-review':'property-review';
  return <section id={id} className="section-shell industrial-review" aria-labelledby={`${id}-title`}>
    <div className="section-top"><div><p className="eyebrow">PROPERTY CONDITIONS / REVIEW</p><h2 id={`${id}-title`}>{reviewTitles[kind]||'설비·접근·이용 조건부터 살펴보세요'}</h2><p className="section-description">매물 유형에 필요한 검토 정보입니다. 제공된 조건과 출처를 확인한 뒤 활용안을 살펴보세요.</p></div></div>
    <div className="industrial-review-grid">{groups.map(group=>{const provided=group.rows.filter(row=>!row.missing),missing=group.rows.filter(row=>row.missing);const rows=(items:typeof group.rows)=>items.map(row=><div className="industrial-review-row" key={row.label}><dt>{row.label}</dt><dd>{row.entries.length?row.entries.map((fact,index)=><div className="industrial-review-entry" key={`${fact.key}-${index}`}><p className="review-fact-label">{fact.label}</p><p>{hasFactValue(fact.value)?<>{fact.value}{fact.unit&&` ${fact.unit}`}</>:'확인 필요'}</p><span className={`evidence-tag evidence-${fact.evidence}`}>{factEvidenceLabel(fact)||'확인 필요'}</span><p className="fact-source">{fact.source?.trim()||'출처 확인 필요'}</p>{fact.publication==='private'&&<span className="evidence-tag">비공개 항목 · 초안에서만 표시</span>}</div>):<span className="muted-text">확인 필요 · 자료 미제공</span>}</dd></div>);return <article className="glass industrial-review-card" data-review-group={group.id} key={group.id}>
      <h3>{group.title}</h3><p className="section-description">{group.description}</p>
      {!!provided.length&&<dl>{rows(provided)}</dl>}{!provided.length&&<p className="review-empty">제공된 상세조건이 없습니다. <a href="#evidence">필요한 자료 요청하기 ↗</a></p>}
      {!!missing.length&&<details className="review-missing"><summary>추가로 확인할 항목 {missing.length}개</summary><dl>{rows(missing)}</dl></details>}
    </article>;})}</div>
    <p className="section-description">자료가 표시되어 있어도 시설 적합성이나 인허가 가능성을 보장하지 않습니다. 서로 다른 값이 있으면 원자료를 대조해 주세요.</p>
  </section>;
}
