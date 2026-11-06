import {PRIMARY_ORIGIN,LEGACY_ORIGIN,originAllowed,corsOrigin} from './site.ts';
export {originAllowed};
export const ORIGIN=PRIMARY_ORIGIN;
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STAGES=['new','contacted','free_consulting','proposal','paid','lost'];
export const SOURCES=['showroom','telegram','blog','instagram','referral','manual','other'];
export const POLICY={version:'spacepick-inquiry-20261104-v2',operator:'Spacepick',contact:'forestasset@naver.com',retentionDays:90};
export type Config={url:string;key:string;telegramToken?:string;telegramChat?:string;fetcher?:typeof fetch;defer?:(work:Promise<unknown>)=>void};
export class InquiryError extends Error{status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
export const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new InquiryError(400,'invalid_input');return v.trim();}
export async function body(req:Request){if(Number(req.headers.get('content-length')||0)>20000)throw new InquiryError(413,'body_too_large');const reader=req.body?.getReader();if(!reader)throw new InquiryError(400,'invalid_input');const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20000){await reader.cancel();throw new InquiryError(413,'body_too_large');}chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return obj(JSON.parse(new TextDecoder().decode(bytes)));}catch{throw new InquiryError(400,'invalid_input');}}
export function normalizeInquiry(input:Record<string,any>,admin=false){
 const name=text(input.name,100,true),phone=text(input.phone,30,true).replace(/[ ()-]/g,''),intended_use=text(input.intended_use,200,true),memo=text(input.memo??'',2000);
 if(!/^\+?[0-9]{7,20}$/.test(phone)||!['rent','buy','both'].includes(input.deal_type)||!['property','free_ad','paid_consulting'].includes(input.service_interest)||!SOURCES.includes(input.source_channel)||input.consent!==true||(!admin&&input.consent_version!==POLICY.version)||input.website)throw new InquiryError(400,'invalid_input');
 return{name,phone,intended_use,memo,deal_type:input.deal_type,service_interest:input.service_interest,source_channel:input.source_channel,consent_version:admin?POLICY.version+'-admin':POLICY.version};
}
export async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export function backend(config:Config){const fetcher=config.fetcher||fetch;
 async function db(path:string,init:RequestInit={}){
  const r=await fetcher(`${config.url}/rest/v1/${path}`,{...init,headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json',...init.headers},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok){let code='';try{code=(await r.json()).message||'';}catch{}const map:Record<string,number>={rate_limited:429,request_conflict:409,context_revision_conflict:409,context_property_mismatch:400,revision_conflict:409,showroom_unavailable:404,inquiry_not_found:404,retention_expired:409,paid_stage_required:400,invalid_edits:400};if(Object.hasOwn(map,code))throw new InquiryError(map[code],code);throw new InquiryError(503,'service_unavailable');}const raw=await r.text();return raw.trim()?JSON.parse(raw):null;
 }
 const rpc=(name:string,args:unknown)=>db(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)});
 async function admin(req:Request){const token=req.headers.get('Authorization')||'';if(!/^Bearer \S+$/.test(token))throw new InquiryError(401,'login_required');const r=await fetcher(`${config.url}/auth/v1/user`,{headers:{apikey:config.key,Authorization:token},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new InquiryError(401,'login_required');const user=await r.json();if(!user.id||user.is_anonymous||user.app_metadata?.showroom_admin!==true)throw new InquiryError(403,'admin_required');return user;}
 async function notify(id:string){if(!config.telegramToken||!config.telegramChat)return;
  let claims;try{claims=await rpc('crm_claim_notifications',{p_limit:1,p_id:id});}catch{return;}
  for(const row of claims||[]){let sent=false;try{const r=await fetcher(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(7000),body:JSON.stringify({chat_id:config.telegramChat,text:`[Spacepick 새 문의]\n접수 ID: ${row.id}\n상세 내용·상담 관리: ${LEGACY_ORIGIN}/admin`})});sent=r.ok&&(await r.json()).ok===true;}catch{}try{await rpc('crm_complete_notification',{p_id:row.id,p_attempt:row.notification_attempts,p_success:sent});}catch{/* Persisted lease allows later retry. */}}
 }
 function scheduleNotify(id:string){const work=notify(id).catch(()=>{});if(config.defer){config.defer(work);return Promise.resolve();}return work;}
 return{db,rpc,admin,notify:scheduleNotify};
}
export function responseTools(req:Request){const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(corsOrigin(req.headers.get('Origin')))Object.assign(headers,{'Access-Control-Allow-Origin':corsOrigin(req.headers.get('Origin'))!,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return{headers,reply:(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers})};}
export function failure(error:unknown,reply:(v:unknown,s?:number)=>Response){return reply({error:error instanceof InquiryError?error.code:'service_unavailable'},error instanceof InquiryError?error.status:503);}
