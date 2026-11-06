import {purposesFor,selectedPurpose,slotsFor,slotMatches,type DecisionKind} from '../../../supabase/functions/_shared/customer-purpose.ts';
import {evidenceLabels,factEvidenceLabel,type Fact} from '../types/showroom';
export function CustomerPurpose({kind,purposeId,onChange,facts,options}:{options?:{id:string;label:string}[];kind:DecisionKind;purposeId:string;onChange:(id:string)=>void;facts:Fact[]}){
 const purposes=purposesFor(kind).filter(p=>!options||options.some(v=>v.id===p.id)).map(p=>({...p,label:options?.find(v=>v.id===p.id)?.label||p.label})),purpose=selectedPurpose(kind,purposeId);if(!purposes.length)return null;
 return <section id="customer-purpose" className="section-shell customer-purpose"><p className="eyebrow">YOUR PURPOSE / FIRST REVIEW</p><h2>{kind==='income'?'어떤 건물 운영을 검토하시나요?':kind==='land'?'어떤 토지 활용을 검토하시나요?':kind==='commercial'?'어떤 업종·이용을 생각하시나요?':'어떤 운영 목적을 검토하시나요?'}</h2>
  <label htmlFor="customer-purpose-select">고객 목적 선택</label><select id="customer-purpose-select" value={purposeId} onChange={e=>onChange(e.target.value)}><option value="">목적을 선택하지 않음</option>{purposes.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
  <p>선택한 목적에 맞춰 검토 순서를 바꿉니다. 매물 사실이나 승인된 내용을 변경하지 않습니다. 주소의 목적 선택값은 새로고침 후에도 유지됩니다.</p>
  {purpose&&<p className="purpose-risk">{purpose.risk} 목적별 우선 표시는 실제 업종·용도 적합성 확인을 뜻하지 않습니다.</p>}
  <div className="purpose-slot-grid">{slotsFor(kind,purposeId).map(slot=>{const entries=facts.filter(f=>slotMatches(slot.key,f.key));return <article className="glass purpose-slot" key={slot.id} data-slot-key={slot.key}><h3>{slot.label}</h3>{entries.length?entries.map((f,i)=><p key={i}>{f.value===null||typeof f.value==='string'&&!f.value.trim()?'확인 필요':<>{f.value}{f.unit&&` ${f.unit}`}</>}<small>{factEvidenceLabel(f)}{f.publication==='private'?' · 비공개 초안':''}</small></p>):<p>확인 필요 · 자료 미제공</p>}</article>;})}</div>
 </section>;
}
