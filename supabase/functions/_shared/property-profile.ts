// Shared data contract. No runtime credentials or database calls in this module.
import {validateRentalScenario,rentalScenarioIssues} from './rental-scenario.ts';
import type {RentalScenario} from './rental-scenario.ts';
export type ProfileStatus='verified'|'provided'|'inferred'|'generated'|'unknown';
export type ProfileField={id:string;key:string;label:string;value:string|number|null;unit:string;status:ProfileStatus;sourceText:string;sourceIds:string[];useApproved:boolean;publication:'private'|'approved';verification?:{method:string;by?:string;at?:string;confirmed?:boolean}};
export type PropertyProfile={version:1;kind:'factory'|'logistics'|'commercial'|'land'|'income'|'unknown';transaction:'sale'|'lease'|'unknown';price:{status:'fixed'|'negotiable'|'unknown';saleWon:number|null;depositWon:number|null;monthlyWon:number|null};fields:ProfileField[];sourcePermissions:{assetId:string;useApproved:boolean;allowDerivedPublication:boolean}[];highlights:{id:string;title:string;description:string;fieldIds:string[];constraints:string}[];modules?:{rentalScenario?:RentalScenario}};
type ObjectValue=Record<string,any>;
const obj=(v:unknown):ObjectValue=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v:{};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifier=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export class ProfileError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
const fail=(code='invalid_property_profile'):never=>{throw new ProfileError(code);};
function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))return fail();return v.trim();}
function list(v:unknown,max:number):any[]{if(!Array.isArray(v)||v.length>max)return fail();return v;}
function one<T extends string>(v:unknown,values:readonly T[]):T{if(!values.includes(v as T))return fail();return v as T;}
function ids(v:unknown,max:number,pattern:RegExp){const result=list(v,max).map(x=>text(x,100,true));if(result.some(x=>!pattern.test(x))||new Set(result).size!==result.length)return fail();return result;}
const hasValue=(v:unknown)=>typeof v==='number'?Number.isFinite(v):typeof v==='string'&&!!v.trim();
type ValidationContext={assets:{id:string;source_type?:string}[];userId:string;now:string;previous?:PropertyProfile};

export function validateProfile(input:unknown,context:ValidationContext):PropertyProfile{
  const p=obj(input);if(p.version!==1)fail();
  const price=obj(p.price);
  const money=(v:unknown):number|null=>{if(v===null)return null;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)fail('invalid_profile_price');return v as number;};
  const result:PropertyProfile={version:1,kind:one(p.kind,['factory','logistics','commercial','land','income','unknown']),transaction:one(p.transaction,['sale','lease','unknown']),price:{status:one(price.status,['fixed','negotiable','unknown']),saleWon:money(price.saleWon),depositWon:money(price.depositWon),monthlyWon:money(price.monthlyWon)},fields:[],sourcePermissions:[],highlights:[]};
  const assets=new Map(context.assets.map(a=>[a.id,a]));
  const permissions=list(p.sourcePermissions,60).map(value=>{
    const s=obj(value),assetId=text(s.assetId,100,true);
    if(!uuid.test(assetId)||!assets.has(assetId))fail('profile_source_missing');
    if(typeof s.useApproved!=='boolean'||typeof s.allowDerivedPublication!=='boolean')fail();
    return {assetId,useApproved:s.useApproved,allowDerivedPublication:s.allowDerivedPublication};
  });
  if(new Set(permissions.map(s=>s.assetId)).size!==permissions.length)fail();
  result.sourcePermissions=permissions;
  result.fields=list(p.fields,60).map(value=>{
    const f=obj(value),id=text(f.id,100,true),key=text(f.key,100,true);
    if(!identifier.test(id)||!identifier.test(key))fail();
    let val=f.value;
    if(typeof val==='string')val=text(val,2000)||null;
    else if(val!==null&&(typeof val!=='number'||!Number.isFinite(val)))fail();
    if(typeof f.useApproved!=='boolean')fail();
    const field:ProfileField={id,key,label:text(f.label,100,true),value:val,unit:text(f.unit,30),status:one(f.status,['verified','provided','inferred','generated','unknown']),sourceText:text(f.sourceText,500),sourceIds:ids(f.sourceIds,10,uuid),useApproved:f.useApproved,publication:one(f.publication,['private','approved'])};
    if(field.sourceIds.some(id=>!assets.has(id)))fail('profile_source_missing');
    if(field.status==='verified'){
      const v=obj(f.verification),method=text(v.method,2000,true);
      if(method.length<10||!hasValue(field.value)||!field.sourceIds.length||field.sourceIds.some(id=>assets.get(id)?.source_type==='ai_generated'))fail('profile_verification_required');
      const previous=context.previous?.fields.find(old=>old.id===id);
      const same=previous?.status==='verified'&&previous.verification?.by&&previous.verification?.at&&JSON.stringify([previous.key,previous.value,previous.unit,previous.sourceText,previous.sourceIds,previous.verification.method])===JSON.stringify([field.key,field.value,field.unit,field.sourceText,field.sourceIds,method]);
      if(!same&&v.confirmed!==true)fail('profile_verification_required');
      field.verification=same?{method,by:previous!.verification!.by,at:previous!.verification!.at}:{method,by:context.userId,at:context.now};
    }
    return field;
  });
  if(new Set(result.fields.map(f=>f.id)).size!==result.fields.length)fail();
  const fieldIds=new Set(result.fields.map(f=>f.id));
  result.highlights=list(p.highlights,3).map(value=>{
    const h=obj(value),id=text(h.id,100,true),references=ids(h.fieldIds,10,identifier);
    if(!identifier.test(id)||references.some(id=>!fieldIds.has(id)))fail();
    return {id,title:text(h.title,100,true),description:text(h.description,2000),fieldIds:references,constraints:text(h.constraints,2000)};
  });
  if(new Set(result.highlights.map(h=>h.id)).size!==result.highlights.length)fail();
  if(p.modules!==undefined){
    if(!p.modules||typeof p.modules!=='object'||Array.isArray(p.modules))fail('invalid_rental_scenario');
    if(p.modules.rentalScenario!==undefined){
      try{result.modules={rentalScenario:validateRentalScenario(p.modules.rentalScenario)};}
      catch{fail('invalid_rental_scenario');}
    }
  }
  return result;
}

function visibleField(field:ProfileField,profile:PropertyProfile){
  return field.publication==='approved'&&field.useApproved===true&&!!field.sourceText&&field.status!=='unknown'&&hasValue(field.value)
    &&field.sourceIds.every(id=>profile.sourcePermissions.some(s=>s.assetId===id&&s.useApproved===true&&s.allowDerivedPublication===true))
    &&(field.status!=='verified'||!!field.verification?.by&&!!field.verification?.at);
}
export function profileFacts(profile:PropertyProfile,includePrivate=false){
  return profile.fields.filter(f=>includePrivate||visibleField(f,profile)).map(f=>({key:f.key,label:f.label,value:f.value,unit:f.unit,evidence:f.status==='verified'?'verified' as const:f.status==='provided'?'owner_provided' as const:f.status==='unknown'?'needs_review' as const:'ai_hypothesis' as const,source:f.sourceText||'출처 확인 필요',...(includePrivate?{publication:f.publication}:{})}));
}
export function publicProfileHighlights(profile:PropertyProfile){
  const visible=new Set(profile.fields.filter(f=>visibleField(f,profile)&&['verified','provided'].includes(f.status)).map(f=>f.id));
  // Do not expose source IDs, verification notes or private profile metadata.
  return profile.highlights.filter(h=>h.fieldIds.length&&h.fieldIds.every(id=>visible.has(id))).map(h=>({title:h.title,description:h.description,constraints:h.constraints,references:profileFacts({...profile,fields:profile.fields.filter(f=>h.fieldIds.includes(f.id))})}));
}
export function profileSummary(profile:PropertyProfile){
  const fixed=profile.price.status==='fixed';
  return {kind:profile.kind,transaction:profile.transaction,price:{status:profile.price.status,saleWon:fixed&&profile.transaction==='sale'?profile.price.saleWon:null,depositWon:fixed&&profile.transaction==='lease'?profile.price.depositWon:null,monthlyWon:fixed&&profile.transaction==='lease'?profile.price.monthlyWon:null}};
}
export function profilePublicationIssues(profile:PropertyProfile,assets:{id:string}[],address:unknown){
  const issues:{code:string;message:string;target:string}[]=[];
  const add=(message:string)=>issues.push({code:'profile_review_required',message,target:'property-facts-editor'});
  if(profile.kind==='unknown')add('매물의 세부 유형을 선택해 주세요.');
  if(profile.transaction==='unknown')add('매매 또는 임대 거래방식을 선택해 주세요.');
  if(typeof address!=='string'||!address.trim())add('매물 소재지를 입력하고 저장해 주세요.');
  if(profile.price.status==='unknown')add('가격 또는 가격 협의 상태를 확인해 주세요.');
  if(profile.price.status==='fixed'&&(profile.transaction==='sale'?profile.price.saleWon===null:profile.transaction==='lease'?(profile.price.depositWon===null||profile.price.monthlyWon===null):true))add('거래방식에 맞는 가격을 입력해 주세요.');
  if(!profile.fields.some(f=>['land_area','building_area','gross_floor_area','exclusive_area','contract_area','warehouse_area'].includes(f.key)&&typeof f.value==='number'&&f.value>0&&f.unit==='㎡'&&['provided','verified'].includes(f.status)&&visibleField(f,profile)))add('공개 가능한 면적과 단위·출처를 확인해 주세요.');
  if(profile.fields.some(f=>f.publication==='approved'&&!visibleField(f,profile)))add('공개할 정보의 값·출처·사용 권한과 근거자료 공개 범위를 확인해 주세요.');
  const sourceIds=profile.fields.flatMap(f=>f.sourceIds);
  if(sourceIds.some(id=>!assets.some(a=>a.id===id)))add('삭제되었거나 다른 매물에 속하는 근거자료를 다시 연결해 주세요.');
  const rental=profile.modules?.rentalScenario;
  if(rental?.enabled&&rental.publication==='approved'){
    try{for(const message of rentalScenarioIssues(validateRentalScenario(rental)))issues.push({code:'profile_review_required',message:`임대 가정 계산: ${message}`,target:'rental-scenario-editor'});}
    catch{issues.push({code:'profile_review_required',message:'임대 가정 계산의 입력 범위와 형식을 확인해 주세요.',target:'rental-scenario-editor'});}
  }
  return issues;
}
