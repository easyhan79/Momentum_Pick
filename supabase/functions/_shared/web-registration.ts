import {purposesFor} from './customer-purpose.ts';
import {validateProfile,profileSummary,ProfileError,type PropertyProfile} from './property-profile.ts';
export type RegistrationContact={name:string;phone:string;publicApproved:boolean};
export type WebInput={version:1;mode:'simple'|'materials';providedText:string};
export function intakeInput(value:unknown):WebInput{
 const v=value as Record<string,any>;
 if(!v||!['simple','materials'].includes(v.mode??'simple')||typeof (v.providedText??v.summary)!=='string'||(v.providedText??v.summary).length>16000)throw new ProfileError('web_source_invalid');
 return {version:1,mode:v.mode??'simple',providedText:v.providedText??v.summary};
}
export function intakeDraft(value:Record<string,any>,userId:string){
 const content=registrationDraft({...value,summary:''},userId);
 // Old image workers select visualMode=ai_generated. New manual intakes must
 // remain safe even while that old worker is still deployed.
 return {...content,imagePolicy:{version:1,mode:'manual_web'}};
}
export function registrationContact(value:unknown):RegistrationContact{
 const v=value as Record<string,unknown>;
 if(!v||typeof v!=='object'||typeof v.name!=='string'||v.name.length>100||typeof v.phone!=='string'||v.phone.length>50||typeof v.publicApproved!=='boolean')throw new ProfileError('invalid_registration');
 return {name:v.name.trim(),phone:v.phone.trim(),publicApproved:v.publicApproved};
}
export function registrationIssues(draft:Record<string,any>){
 if(draft.registration?.channel!=='web')return [];
 const contact=draft.registration.contact;
 return contact&&typeof contact.name==='string'&&contact.name.trim()&&typeof contact.phone==='string'&&/^[0-9+()\s-]{7,30}$/.test(contact.phone)&&contact.publicApproved===true?[]:[{code:'registration_contact_required',message:'담당자 이름·업무용 연락처와 공개 동의를 확인해 주세요.',target:'property-facts-editor'}];
}
export function registrationDraft(value:unknown,userId:string){
 const v=value as Record<string,any>;
 const text=(key:string,max:number)=>{if(typeof v?.[key]!=='string'||v[key].length>max)throw new ProfileError('invalid_registration');return v[key].trim();};
 const title=text('title',200),address=text('address',300),summary=text('summary',4000);
 if(v.area!==null&&(typeof v.area!=='number'||!Number.isFinite(v.area)||v.area<=0))throw new ProfileError('invalid_registration');
 if(typeof v.rightsConfirmed!=='boolean')throw new ProfileError('invalid_registration');
 const areas:Record<string,string>={land_area:'토지면적',building_area:'건축면적',gross_floor_area:'연면적',exclusive_area:'전용면적',contract_area:'계약·공급면적',warehouse_area:'창고면적'};
 const areaKey=v.areaKey??(v.kind==='commercial'?'exclusive_area':'land_area');if(!areas[areaKey])throw new ProfileError('invalid_registration');
 const profile=validateProfile({version:1,kind:v.kind,transaction:v.transaction,price:v.price,fields:[{id:'initial-area',key:areaKey,label:areas[areaKey],unit:'㎡',value:v.area,status:v.area===null?'unknown':'provided',sourceText:v.area===null?'':'등록자 제공정보 · 미검증',sourceIds:[],useApproved:v.rightsConfirmed,publication:v.rightsConfirmed&&v.area!==null?'approved':'private'}],sourcePermissions:[],highlights:[]},{assets:[],userId,now:new Date().toISOString()});
 return {schema_version:'1.0',id:'assigned-by-server',category:profile.kind==='factory'||profile.kind==='logistics'?'industrial':profile.kind,title:title||'매물 검토 초안',subtitle:'매물 조건과 활용 방향을 검토합니다.',summary:summary||'등록된 매물 정보를 검토하는 비공개 초안입니다.',address,addressEvidence:'owner_provided',propertyProfile:profile,registration:{channel:'web',rightsApproved:v.rightsConfirmed,contact:registrationContact(v.contact)},facts:[],concepts:[],unknowns:['제공정보의 출처·현황·인허가 조건을 확인해 주세요.'],assets:[]};
}
export function webAnalysisInput(draft:Record<string,any>,source?:Pick<WebInput,'providedText'>){
 const p=draft.propertyProfile as PropertyProfile;
 if(!p)throw new ProfileError('invalid_registration');
 const fields=p.fields.filter(f=>f.useApproved&&(source?['provided','verified'].includes(f.status):f.status!=='unknown')).map(f=>({label:f.label,value:f.value,unit:f.unit,status:f.status,source:f.sourceText}));
 const input={customerPurposes:purposesFor(p.kind).map(purpose=>({id:purpose.id,label:purpose.label,requiredKeys:purpose.keys,constraints:purpose.risk,additionalCheck:purpose.document})),kind:p.kind,address:draft.address||'',transaction:p.transaction,price:profileSummary(p).price,description:source?source.providedText:draft.summary||'',fields};
 // Web text must not become a Telegram attachment download directive.
 return '웹 등록 매물. 제공정보와 가설을 구분하고 누락 조건을 생성하지 마세요.\n'+JSON.stringify(input).replace(/\[(?:FILE|DOCUMENT)_ID:[^\]]*\]/g,'');
}
