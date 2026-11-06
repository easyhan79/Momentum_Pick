import {defaultDecisionSettings,decisionCards,type DecisionSettings} from '../../../supabase/functions/_shared/customer-decision.ts';
import {purposesFor} from '../../../supabase/functions/_shared/customer-purpose.ts';
import type {PropertyProfile} from '../../../supabase/functions/_shared/property-profile.ts';
import {DecisionCards} from './DecisionCards';
export function DecisionSettingsEditor({profile,busy,onChange}:{profile:PropertyProfile;busy:boolean;onChange:(value:PropertyProfile)=>void}){
 const settings=profile.modules?.customerDecision;
 const change=(patch:Partial<DecisionSettings>)=>{const next={...settings!,...patch};if(!Object.hasOwn(patch,'reviewConfirmed')){delete next.reviewedBy;delete next.reviewedAt;next.reviewConfirmed=false;}onChange({...profile,modules:{...profile.modules,customerDecision:next}});};
 return <section id="decision-settings-editor"><h3>목적별 근거·제약 판단 카드</h3><p>제공자료에서 조건을 정리하는 1차 검토안입니다. 비공개로 준비한 뒤 근거·제약을 확인해 별도로 공개하세요. 실제 업종·인허가·수익을 확정하지 않습니다.</p>
 {!settings?<button type="button" className="button button-outline" disabled={busy||!purposesFor(profile.kind).length} onClick={()=>onChange({...profile,modules:{...profile.modules,customerDecision:defaultDecisionSettings(profile.kind)}})}>판단 카드 초안 준비</button>:<fieldset disabled={busy}><label><input type="checkbox" checked={settings.enabled} onChange={e=>change({enabled:e.target.checked})}/>판단 카드 사용</label>
 <h4>고객 목적과 표시 이름</h4>{purposesFor(profile.kind).map(p=>{const selected=settings.purposes.find(item=>item.id===p.id);return <div key={p.id}><label><input type="checkbox" checked={!!selected} onChange={e=>change({purposes:e.target.checked?[...settings.purposes,{id:p.id,label:p.label}]:settings.purposes.filter(item=>item.id!==p.id)})}/>{p.label}</label>{selected&&<label>목적 표시 이름 · {p.label}<input maxLength={80} value={selected.label} onChange={e=>change({purposes:settings.purposes.map(item=>item.id===p.id?{...item,label:e.target.value}:item)})}/></label>}</div>;})}
 <label>판단 카드 공개 범위<select value={settings.publication} onChange={e=>change({publication:e.target.value as 'private'|'approved'})}><option value="private">비공개 검토</option><option value="approved">검토 후 고객 공개</option></select></label>
 <label><input type="checkbox" checked={settings.reviewConfirmed===true||!!settings.reviewedBy} onChange={e=>change({reviewConfirmed:e.target.checked,...(!e.target.checked?{reviewedBy:undefined,reviewedAt:undefined}:{})})}/>근거·기준일·제약·확인사항을 검토했습니다. 이 확인은 사실 검증이나 허가 확정이 아닙니다.</label><p>상단 초안 저장 후 쇼룸 검수·승인이 필요합니다. 근거나 목적 설정이 바뀌면 다시 검토하세요.</p>
 <details><summary>판단 카드 내부 초안 보기 · 비공개 정보가 포함될 수 있음</summary><DecisionCards decision={{version:1,purposes:settings.purposes,cards:decisionCards(profile,profile.fields,settings),reviewedAt:settings.reviewedAt||''}} purposeId=""/></details>
 </fieldset>}</section>;
}
