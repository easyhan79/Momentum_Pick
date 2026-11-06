import {purposesFor,slotsFor,slotMatches,type DecisionKind} from './customer-purpose.ts';
import type {PropertyProfile,ProfileField,ProfileStatus} from './property-profile.ts';
export type DecisionSettings={version:1;enabled:boolean;publication:'private'|'approved';purposes:{id:string;label:string}[];reviewedBy?:string;reviewedAt?:string;reviewConfirmed?:boolean};
export type DecisionReference={key:string;label:string;value:string|number|null;unit:string;status:ProfileStatus;source:string;asOf:string|null};
export type DecisionCard={id:string;purposeId:string;slotKey:string;title:string;conclusion:string;status:ProfileStatus;references:DecisionReference[];interpretation:string;checks:{id:string;label:string}[]};
export type PublicDecision={version:1;purposes:{id:string;label:string}[];cards:DecisionCard[];reviewedAt:string};
export const decisionStatusLabels:Record<ProfileStatus,string>={verified:'증빙 대조 확인',provided:'제공자료 기준',inferred:'자료 기반 해석',generated:'AI 활용 제안',unknown:'확인 필요'};
export function defaultDecisionSettings(kind:DecisionKind):DecisionSettings{return {version:1,enabled:true,publication:'private',purposes:purposesFor(kind).map(p=>({id:p.id,label:p.label}))};}
function basis(p:PropertyProfile,settings:DecisionSettings){return JSON.stringify([p.kind,p.transaction,p.price,p.fields,p.sourcePermissions,p.modules?.rentalScenario||null,settings.purposes]);}
export function validateDecisionSettings(input:any,profile:PropertyProfile,context:{previous?:PropertyProfile;userId:string;now:string}):DecisionSettings{
 const fail=():never=>{throw Error('invalid_customer_decision');};
 if(!input||input.version!==1||typeof input.enabled!=='boolean'||!['private','approved'].includes(input.publication)||!Array.isArray(input.purposes)||input.purposes.length>8)fail();
 const allowed=new Set(purposesFor(profile.kind).map(p=>p.id));
 const purposes=input.purposes.map((p:any)=>{if(!p||!allowed.has(p.id)||typeof p.label!=='string'||!p.label.trim()||p.label.length>80)fail();return {id:p.id,label:p.label.trim()};});
 if(new Set(purposes.map((p:any)=>p.id)).size!==purposes.length||input.enabled&&!purposes.length)fail();
 const result:DecisionSettings={version:1,enabled:input.enabled,publication:input.publication,purposes};
 const previous=context.previous?.modules?.customerDecision;
 const unchanged=previous&&previous.reviewedBy&&previous.reviewedAt&&basis(context.previous!,previous)===basis(profile,result);
 if(result.enabled&&input.reviewConfirmed===true){result.reviewedBy=context.userId;result.reviewedAt=context.now;}
 else if(unchanged&&input.reviewConfirmed!==false){result.reviewedBy=previous.reviewedBy;result.reviewedAt=previous.reviewedAt;}
 return result;
}
const hasValue=(f:ProfileField)=>f.value!==null&&(typeof f.value==='number'?Number.isFinite(f.value):!!f.value.trim());
export function decisionCards(profile:PropertyProfile,fields:ProfileField[],settings:DecisionSettings):DecisionCard[]{
 return settings.purposes.flatMap(config=>{const purpose=purposesFor(profile.kind).find(p=>p.id===config.id);if(!purpose)return [];
  return slotsFor(profile.kind,purpose.id).map(slot=>{
   const matches=fields.filter(f=>slotMatches(slot.key,f.key)&&hasValue(f)&&f.status!=='unknown');
   const distinct=new Set(matches.map(f=>JSON.stringify([f.value,f.unit])));
   const factual=matches.filter(f=>['verified','provided'].includes(f.status));
   const conflict=distinct.size>1;
   const status:ProfileStatus=!matches.length?'unknown':conflict?'inferred':!factual.length?matches[0].status:factual.every(f=>f.status==='verified'&&f.verification?.by&&f.verification?.at)?'verified':'provided';
   const conclusion=!matches.length?`${slot.label} 자료가 없어 판단을 보류합니다.`:conflict?`${slot.label}에 서로 다른 값이 있어 원자료 대조가 필요합니다.`:!factual.length?`${slot.label}은 해석·생성 자료이므로 실제 조건 확인이 필요합니다.`:`${slot.label}의 ${status==='verified'?'증빙 대조 기록':'제공정보'}가 있습니다. 목적 적합성은 추가 검토가 필요합니다.`;
   return {id:purpose.id+'--'+slot.key,purposeId:purpose.id,slotKey:slot.key,title:slot.label,conclusion,status,references:matches.map(f=>({key:f.key,label:f.label,value:f.value,unit:f.unit,status:f.status==='verified'&&(!f.verification?.by||!f.verification?.at)?'provided':f.status,source:f.sourceText,asOf:f.asOf||null})),interpretation:purpose.risk,checks:[{id:slot.id,label:slot.label+' 확인 요청'}]};
  });
 });
}
export function publicDecision(profile:PropertyProfile,allowedFields:ProfileField[]):PublicDecision|undefined{
 const settings=profile.modules?.customerDecision;
 if(settings?.version!==1||!settings.enabled||settings.publication!=='approved'||typeof settings.reviewedBy!=='string'||!settings.reviewedBy||typeof settings.reviewedAt!=='string'||!settings.reviewedAt||!Array.isArray(settings.purposes)||settings.purposes.length>8)return;
 if(settings.purposes.some(p=>!purposesFor(profile.kind).some(v=>v.id===p.id)||typeof p.label!=='string'||p.label.length>80))return;
 return {version:1,purposes:settings.purposes.map(p=>({id:p.id,label:p.label})),cards:decisionCards(profile,allowedFields,settings),reviewedAt:settings.reviewedAt};
}
