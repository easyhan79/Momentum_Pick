import {purposesFor,selectedPurpose,slotsFor,type DecisionKind} from './customer-purpose.ts';
import {InquiryError,UUID} from './inquiries.ts';
export type InquiryContext={version:1;propertyId:string;purposeId:string;purposeLabel:string;conceptId:string;conceptLabel:string;checks:{id:string;label:string}[]};
export function inquiryContextText(context:InquiryContext){
 return ['[고객 검토 문맥]',`매물: ${context.propertyId}`,`고객 목적: ${context.purposeLabel||'선택하지 않음'}${context.purposeId?' ('+context.purposeId+')':''}`,`활용 콘셉트: ${context.conceptLabel||'선택하지 않음'}${context.conceptId?' ('+context.conceptId+')':''}`,...context.checks.map(c=>`- ${c.label} (${c.id})`)].join('\n');
}
export function normalizeInquiryContext(input:unknown,showroom:any,propertyId:string):InquiryContext{
 const fail=():never=>{throw new InquiryError(400,'invalid_inquiry_context');};
 if(!input||typeof input!=='object'||Array.isArray(input))return fail();
 const v=input as Record<string,any>;
 if(v.version!==1||!UUID.test(v.propertyId||'')||v.propertyId!==propertyId||showroom.id!==propertyId||typeof v.purposeId!=='string'||typeof v.conceptId!=='string'||!Array.isArray(v.checkIds)||v.checkIds.length>12||new Set(v.checkIds).size!==v.checkIds.length)fail();
 const kind:DecisionKind=showroom.propertySummary?.kind&&showroom.propertySummary.kind!=='unknown'?showroom.propertySummary.kind:showroom.category;
 const purpose=selectedPurpose(kind,v.purposeId);
 if(v.purposeId&&!purpose)fail();
 const publicPurposes=showroom.customerDecision?.purposes;
 if(v.purposeId&&publicPurposes&&!publicPurposes.some((p:any)=>p.id===v.purposeId))fail();
 const concept=showroom.concepts?.find((c:any)=>c.id===v.conceptId);
 if(v.conceptId&&!concept)fail();
 const allowed=slotsFor(kind,v.purposeId);
 const checks=v.checkIds.map((id:unknown)=>{if(typeof id!=='string')return fail();const slot=allowed.find(s=>s.id===id);if(!slot)return fail();return {id:slot.id,label:slot.label+' 확인 요청'};});
 return {version:1,propertyId,purposeId:v.purposeId,purposeLabel:publicPurposes?.find((p:any)=>p.id===v.purposeId)?.label||purpose?.label||'',conceptId:v.conceptId,conceptLabel:concept?.conceptName||'',checks};
}
