import {purposesFor} from '../../../supabase/functions/_shared/customer-purpose.ts';
import type {Concept,Showroom} from '../types/showroom';
export function ConceptsEditor({content,busy,onChange}:{content:Showroom;busy:boolean;onChange:(value:Showroom)=>void}){
 const update=(concepts:Concept[])=>onChange({...content,concepts});
 const edit=(id:string,patch:Partial<Concept>)=>update(content.concepts.map(c=>c.id===id?{...c,...patch}:c));
 const move=(index:number,delta:number)=>{const next=[...content.concepts];[next[index],next[index+delta]]=[next[index+delta],next[index]];update(next);};
 return <section id="concepts-editor" className="glass admin-editor"><h2>활용 콘셉트 편집</h2><p>매물에 맞는 활용 가설을 최대 3개 구성하세요. 내용이 바뀐 콘셉트의 기존 생성 이미지는 저장 시 초안에서 제외됩니다. 이미지 제작 중에는 완료 후 수정하세요.</p>
   {content.concepts.map((concept,index)=><fieldset className="fact-editor-field" disabled={busy} key={concept.id}><legend>활용 콘셉트 {index+1}</legend>
    <label>콘셉트명<input maxLength={100} value={concept.conceptName} onChange={e=>edit(concept.id,{conceptName:e.target.value})}/></label>
    <label>한 줄 설명<input maxLength={500} value={concept.headline} onChange={e=>edit(concept.id,{headline:e.target.value})}/></label>
    <label>제안 이유·필요조건·제약<textarea maxLength={2000} value={concept.rationale} onChange={e=>edit(concept.id,{rationale:e.target.value})}/></label>
    <fieldset><legend>연관 고객 목적</legend>{purposesFor(content.propertyProfile?.kind||content.category).map(p=><label key={p.id}><input type="checkbox" checked={concept.purposeIds?.includes(p.id)||false} onChange={e=>edit(concept.id,{purposeIds:e.target.checked?[...(concept.purposeIds||[]),p.id]:(concept.purposeIds||[]).filter(id=>id!==p.id)})}/>{p.label}</label>)}<p>목적 연결은 표시 우선순위이며 적합성 확인이 아닙니다. 변경 후 기존 콘셉트 이미지는 다시 검토해야 합니다.</p></fieldset>
    <p>구역별 상세 내용과 도면 연결은 아래 「공간 구상도·구역 안내」에서 편집할 수 있습니다.</p>
    <div className="admin-toolbar"><button type="button" className="button button-outline" disabled={index===0} onClick={()=>move(index,-1)}>위로 이동</button><button type="button" className="button button-outline" disabled={index===content.concepts.length-1} onClick={()=>move(index,1)}>아래로 이동</button><button type="button" className="button button-outline" onClick={()=>update(content.concepts.filter(c=>c.id!==concept.id))}>콘셉트 삭제</button></div>
    <button type="button" className="button button-outline" disabled={concept.zones.length>=5} onClick={()=>edit(concept.id,{zones:[...concept.zones,{id:crypto.randomUUID(),label:`검토 구역 ${concept.zones.length+1}`,title:'구역 활용 검토',body:'실제 구조·시설·인허가 조건 확인 필요',evidence:'ai_hypothesis',indoorOutdoor:'unknown'}]})}>검토 구역 추가</button>
    {concept.zones.map(zone=><div className="admin-toolbar" key={zone.id}><span>{zone.label}</span><button type="button" className="button button-outline" onClick={()=>edit(concept.id,{zones:concept.zones.filter(z=>z.id!==zone.id)})}>이 구역 삭제</button></div>)}
   </fieldset>)}
   <button type="button" className="button button-outline" disabled={busy||content.concepts.length>=3} onClick={()=>{const id=['concept-1','concept-2','concept-3'].find(id=>!content.concepts.some(c=>c.id===id));if(id)update([...content.concepts,{id,conceptName:'새 활용 방향',headline:'활용 가능성을 검토합니다.',rationale:'제공자료와 이용 조건을 확인한 뒤 구체화할 가설입니다.',feasibility:'not_checked',zones:[]}]);}}>활용 콘셉트 추가</button>
 </section>;
}
