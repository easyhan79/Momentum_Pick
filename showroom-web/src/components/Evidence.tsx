import {ClipboardCheck,FileSearch} from 'lucide-react';
import {customerQuestions} from '../lib/customerReview';
import type {ReviewKind} from '../lib/propertyReview';
import type {Fact} from '../types/showroom';
export function Evidence({unknowns,facts=[],kind='unknown',selected=[],onSelect}:{unknowns:string[];facts?:Fact[];kind?:ReviewKind;selected?:string[];onSelect?:(document:string,checked:boolean)=>void}){
 const questions=customerQuestions(kind,facts,unknowns);
 return <section className="section-shell customer-evidence" id="evidence" aria-labelledby="evidence-title">
  <div className="section-top"><div><p className="eyebrow">CHECK BEFORE YOUR DECISION</p><h2 id="evidence-title">결정 전에, 이 자료를 확인하세요.</h2><p className="section-description">궁금한 항목을 고르면 문의할 때 함께 전달됩니다. 공개되지 않은 원본 자료는 담당자에게 요청해 주세요.</p></div><span className="evidence-tag">유형별 검토 가이드</span></div>
  <div className="customer-question-grid">{questions.map(q=><article key={q.id} className="glass customer-question"><div className="question-heading"><span className="small-label">{q.provided.length?'제공정보 있음 · 원문 대조':'자료 요청으로 확인'}</span><h3>{q.title}</h3></div><p>{q.why}</p>
    <p className="question-document"><FileSearch size={16}/><span>{q.document}</span></p>
    {onSelect&&<label className="request-choice"><input type="checkbox" checked={selected.includes(q.document)} disabled={!selected.includes(q.document)&&selected.length>=12} onChange={e=>onSelect(q.document,e.target.checked)}/><span>이 자료 확인을 요청할게요</span></label>}
  </article>)}</div>
  <div className="material-request-actions"><p><ClipboardCheck size={18}/> {selected.length?`${selected.length}개 자료를 문의에 함께 요청합니다.`:'받고 싶은 자료를 선택해 보세요.'}</p><a className="button button-gold" href="#inquiry">{selected.length?'선택한 자료로 문의하기':'담당자에게 문의하기'} ↗</a></div>
  <p className="section-description">제공정보·검토 기록과 AI 활용 가설을 구분합니다. 가이드는 현장 확인이나 인허가 검토를 대신하지 않습니다.</p>
 </section>;
}
