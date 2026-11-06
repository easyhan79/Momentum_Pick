import {copyReviewLabels,type CopyReviewItem} from '../../../supabase/functions/_shared/customer-copy.ts';
export function CopyReviewPanel({items}:{items:CopyReviewItem[]}){
 return <section className="copy-review-panel"><h3>관리자 문안 검토 메모</h3><p>AI가 분석 당시 제안한 구분입니다. 실제 증빙 대조·사실 확인 완료를 뜻하지 않습니다. 편집 후 문안과 대조해 주세요. 이 메모는 고객 쇼룸에 표시되지 않습니다.</p>
  {items.length?items.map((item,index)=><article className="fact-editor-field" key={index}><strong>{copyReviewLabels[item.category]}</strong><p>{item.statement}</p><p>확인할 내용: {item.check}</p></article>):<p>별도 검토 메모가 없는 기존 분석입니다. 임대차 기간·계약 승계 등 중요한 조건은 원자료로 확인해 주세요.</p>}
 </section>;
}
