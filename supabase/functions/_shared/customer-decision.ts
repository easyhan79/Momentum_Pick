import {analysisRule,ANALYSIS_ENGINE} from './analysis-rules.ts';
import {purposesFor,slotsFor,slotMatches,type DecisionKind} from './customer-purpose.ts';
import type {PropertyProfile,ProfileField,ProfileStatus} from './property-profile.ts';
export type DecisionSettings={version:1;enabled:boolean;publication:'private'|'approved';purposes:{id:string;label:string}[];reviewedBy?:string;reviewedAt?:string;reviewConfirmed?:boolean};
export type DecisionReference={key:string;label:string;value:string|number|null;unit:string;status:ProfileStatus;source:string;asOf:string|null};
export type DecisionCard={id:string;purposeId:string;slotKey:string;title:string;conclusion:string;status:ProfileStatus;references:DecisionReference[];interpretation:string;checks:{id:string;label:string}[];analysisStatus?:'inferred';conditionState?:'checked'|'review'|'unknown';materials?:string[]};
export type PublicDecision={version:1;engineVersion?:typeof ANALYSIS_ENGINE;purposes:{id:string;label:string}[];cards:DecisionCard[];reviewedAt:string};
export const decisionStatusLabels:Record<ProfileStatus,string>={verified:'증빙 대조 확인',provided:'제공자료 기준',inferred:'자료 기반 해석',generated:'AI 활용 제안',unknown:'확인 필요'};
export function defaultDecisionSettings(kind:DecisionKind):DecisionSettings{return {version:1,enabled:true,publication:'private',purposes:purposesFor(kind).map(p=>({id:p.id,label:p.label}))};}
function canonical(value:any):any{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));return value;}
function basis(p:PropertyProfile,settings:DecisionSettings){return JSON.stringify(canonical([p.kind,p.transaction,p.price,p.fields,p.sourcePermissions,p.modules?.rentalScenario||null,settings.purposes]));}
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
   const conflict=slot.key!=='rent_roll'&&distinct.size>1;
   const zero=factual.some(f=>typeof f.value==='number'&&f.value<=0);
   const rule=analysisRule(slot.key,purpose.risk);
   const status:ProfileStatus=!matches.length?'unknown':conflict?'inferred':!factual.length?matches[0].status:factual.every(f=>f.status==='verified'&&f.verification?.by&&f.verification?.at)?'verified':'provided';
   let conclusion=!matches.length?`${slot.label} 자료가 없어 판단을 보류합니다.`:conflict?`${slot.label}에 서로 다른 값이 있어 원자료 대조가 필요합니다.`:!factual.length?`${slot.label}은 해석·생성 자료이므로 실제 조건 확인이 필요합니다.`:`${slot.label}의 ${status==='verified'?'증빙 대조 기록':'제공정보'}가 있습니다. 목적 적합성은 추가 검토가 필요합니다.`;
   if(factual.length&&!conflict&&zero)conclusion=`${slot.label}에 0 또는 음수 제공값이 있습니다. 누락값으로 바꾸지 않고 적용 범위·단위를 재확인해야 합니다.`;
   if(slot.key==='rent_roll'&&factual.length)conclusion=`제공된 층별 임대 기록 ${factual.length}건을 검토합니다. 미제공 층이나 임대료 합계를 추정하지 않습니다.`;
   return {analysisStatus:'inferred' as const,conditionState:!factual.length?'unknown' as const:status==='verified'&&!conflict&&!zero?'checked' as const:'review' as const,materials:rule.materials,id:purpose.id+'--'+slot.key,purposeId:purpose.id,slotKey:slot.key,title:slot.label,conclusion,status,references:matches.map(f=>({key:f.key,label:f.label,value:f.value,unit:f.unit,status:f.status==='verified'&&(!f.verification?.by||!f.verification?.at)?'provided':f.status,source:f.sourceText,asOf:f.asOf||null})),interpretation:rule.interpretation,checks:[{id:slot.id,label:slot.label+' 확인 요청'}]};
  });
 });
}
export function publicDecision(profile:PropertyProfile,allowedFields:ProfileField[]):PublicDecision|undefined{
 const settings=profile.modules?.customerDecision;
 if(settings?.version!==1||!settings.enabled||settings.publication!=='approved'||typeof settings.reviewedBy!=='string'||!settings.reviewedBy||typeof settings.reviewedAt!=='string'||!settings.reviewedAt||!Array.isArray(settings.purposes)||settings.purposes.length>8)return;
 if(settings.purposes.some(p=>!purposesFor(profile.kind).some(v=>v.id===p.id)||typeof p.label!=='string'||p.label.length>80))return;
 return {version:1,engineVersion:ANALYSIS_ENGINE,purposes:settings.purposes.map(p=>({id:p.id,label:p.label})),cards:decisionCards(profile,allowedFields,settings),reviewedAt:settings.reviewedAt};
}

// A published report is frozen at approval. Never regenerate its prose on GET.
export function frozenDecision(value:unknown,profile:PropertyProfile,allowedFields:ProfileField[]):PublicDecision|undefined{
 const settings=profile.modules?.customerDecision,raw=value as PublicDecision;
 if(!settings?.enabled||settings.publication!=='approved'||!settings.reviewedBy||!settings.reviewedAt||!raw||raw.version!==1||raw.engineVersion!==ANALYSIS_ENGINE||raw.reviewedAt!==settings.reviewedAt||!Array.isArray(raw.purposes)||raw.purposes.some(p=>!p||typeof p.id!=='string'||typeof p.label!=='string')||!Array.isArray(settings.purposes)||JSON.stringify(raw.purposes.map(p=>[p.id,p.label]))!==JSON.stringify(settings.purposes.map(p=>[p.id,p.label]))||!Array.isArray(raw.cards)||raw.cards.length>60)return;
 const reference=(f:ProfileField)=>({key:f.key,label:f.label,value:f.value,unit:f.unit,status:f.status,source:f.sourceText,asOf:f.asOf||null});
 const identity=(r:DecisionReference)=>!r||typeof r!=='object'?'':JSON.stringify([r.key,r.label,r.value,r.unit,r.status,r.source,r.asOf||null]);
 const allowed=allowedFields.filter(hasValue).map(reference),cards:DecisionCard[]=[];
 const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max?v:undefined;
 for(const card of raw.cards){
  const slot=slotsFor(profile.kind,card?.purposeId).find(s=>s.key===card?.slotKey);
  if(!slot||!settings.purposes.some(p=>p.id===card.purposeId)||card.id!==card.purposeId+'--'+slot.key||!Array.isArray(card.references)||card.references.length>60)continue;
  const refs=card.references.map(r=>allowed.find(a=>slotMatches(slot.key,a.key)&&identity(a)===identity(r)));
  if(refs.some(r=>!r))continue;
  const conclusion=text(card.conclusion,1000),interpretation=text(card.interpretation,2000),title=text(card.title,100);
  if(!conclusion||!interpretation||!title||/수익률\s*보장|확정\s*수익|무조건|허가.{0,8}가능합니다/.test(conclusion))continue;
  const status:ProfileStatus=!refs.length?'unknown':card.status==='verified'&&refs.every(r=>r!.status==='verified')?'verified':['provided','inferred','generated'].includes(card.status)?card.status:'inferred';
  cards.push({id:card.id,purposeId:card.purposeId,slotKey:slot.key,title,conclusion,status,references:refs as DecisionReference[],interpretation,analysisStatus:'inferred',conditionState:card.conditionState==='checked'&&status==='verified'?'checked':card.conditionState==='unknown'||status==='unknown'?'unknown':'review',materials:Array.isArray(card.materials)?card.materials.filter(v=>typeof v==='string'&&v.length<=300).slice(0,10):[],checks:[{id:slot.id,label:slot.label+' 확인 요청'}]});
 }
 return {version:1,engineVersion:ANALYSIS_ENGINE,purposes:raw.purposes.map(p=>({id:p.id,label:p.label})),cards,reviewedAt:raw.reviewedAt};
}
