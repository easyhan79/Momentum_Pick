import type {PropertyProfile} from '../../../supabase/functions/_shared/property-profile.ts';
export function PropertyHighlightsEditor({profile,busy,onChange}:{profile:PropertyProfile;busy:boolean;onChange:(value:PropertyProfile)=>void}){
  function change(id:string,patch:Partial<PropertyProfile['highlights'][number]>){onChange({...profile,highlights:profile.highlights.map(h=>h.id===id?{...h,...patch}:h)});}
  return <section className="property-highlights-editor"><h3>주요 검토 이유 · 최대 3개</h3><p>장점으로 제시할 내용에 실제 제공정보나 증빙을 연결하세요. 모든 근거가 공개 가능한 경우에만 고객에게 표시됩니다. AI 활용 가설은 이 요약의 근거로 사용하지 않습니다.</p>
    {profile.highlights.map((highlight,index)=><fieldset className="fact-editor-field" disabled={busy} key={highlight.id}><legend>검토 이유 {index+1}</legend>
      <label>검토 이유 제목<input maxLength={100} value={highlight.title} onChange={e=>change(highlight.id,{title:e.target.value})}/></label>
      <label>설명<textarea maxLength={2000} value={highlight.description} onChange={e=>change(highlight.id,{description:e.target.value})}/></label>
      <label>연결할 근거정보<select aria-label="연결할 근거정보" multiple value={highlight.fieldIds} onChange={e=>change(highlight.id,{fieldIds:Array.from(e.target.selectedOptions,option=>option.value)})}>{profile.fields.map(field=><option value={field.id} key={field.id}>{field.label} · {field.publication==='private'?'비공개':'공개 검토'} · {field.status}</option>)}</select></label>
      <button type="button" className="button button-outline" disabled={!highlight.fieldIds.length} onClick={()=>change(highlight.id,{fieldIds:[]})}>근거 선택 해제</button>
      <label>제약·확인사항<textarea maxLength={2000} value={highlight.constraints} onChange={e=>change(highlight.id,{constraints:e.target.value})}/></label>
      <button type="button" className="button button-outline" onClick={()=>onChange({...profile,highlights:profile.highlights.filter(h=>h.id!==highlight.id)})}>검토 이유 삭제</button>
    </fieldset>)}
    <button type="button" className="button button-outline" disabled={busy||profile.highlights.length>=3} onClick={()=>onChange({...profile,highlights:[...profile.highlights,{id:crypto.randomUUID(),title:'검토 이유',description:'',constraints:'',fieldIds:[]}]})}>검토 이유 추가</button>
  </section>;
}
