import { ArrowUpRight, ClipboardCheck, FileSearch } from 'lucide-react';

export function Evidence({ unknowns }: { unknowns: string[] }) {
  return <section className="section-shell evidence-section" id="evidence" aria-labelledby="evidence-title">
    <div className="evidence-intro"><p className="eyebrow">03 / LOCATION & EVIDENCE</p><h2 id="evidence-title">가능성의 출발점은<br /><span className="gold-text">확인된 근거입니다.</span></h2><p>상권과 사용 조건을 수치로 단정하지 않습니다.<br />자료를 확인한 뒤 공간에 맞는 선택을 돕겠습니다.</p><div className="evidence-legend"><span><ClipboardCheck size={18} /> 제공정보</span><ArrowUpRight size={15} /><span><FileSearch size={18} /> 자료 대조</span></div><p className="muted-text">현재 예시에는 검증 완료된 상권 데이터가 없습니다.</p></div>
    <div className="evidence-checklist glass"><div className="checklist-heading"><span>검토할 항목</span><span className="evidence-tag">확인 필요 {unknowns.length}건</span></div>{unknowns.length ? unknowns.map((text, i) => <div className="checklist-row" key={text}><span className="check-index">{String(i + 1).padStart(2, '0')}</span><p>{text}</p><span className="review-dot" title="확인 필요" /></div>) : <p className="muted-text">검토 목록 자료 확인 필요</p>}</div>
  </section>;
}
