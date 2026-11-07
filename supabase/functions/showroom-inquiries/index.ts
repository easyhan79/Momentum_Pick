import {previewEnvironment} from '../_shared/deployment.ts';
import {publicDto} from '../_shared/public-showroom-dto.ts';
import {normalizeInquiryContext,inquiryContextText} from '../_shared/customer-inquiry.ts';
import {backend,body,failure,hash,InquiryError,normalizeInquiry,ORIGIN,originAllowed,POLICY,responseTools,UUID,type Config} from '../_shared/inquiries.ts';
export function createInquiryHandler(config:Config){const {db,rpc,notify}=backend(config);return async(req:Request)=>{const{headers,reply}=responseTools(req);if(config.privatePreview)return reply({error:'not_found'},404);if(!originAllowed(req.headers.get('Origin')))return reply({error:'origin_denied'},403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{if(req.method==='GET'&&new URL(req.url).searchParams.get('action')==='policy')return reply({policy:POLICY});if(req.method!=='POST')throw new InquiryError(405,'method_not_allowed');const input=await body(req),slug=input.slug;
 if(typeof slug!=='string'||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>120||!UUID.test(input.request_id||''))throw new InquiryError(400,'invalid_input');
 const data=normalizeInquiry(input);
 let contextProperty:string|undefined,contextRevision:number|undefined;
 if(input.request_context!==undefined){
  const rows=await db(`property_showrooms?slug=eq.${encodeURIComponent(slug)}&showroom_status=eq.published&select=property_id,listing_state,published_content,published_revision,approved_by,approved_at,published_at&limit=1`),row=rows[0];
  if(!row||row.listing_state==='closed'||!row.approved_by||!row.approved_at||!row.published_at||!Number.isSafeInteger(row.published_revision))throw new InquiryError(404,'showroom_unavailable');
  const publicContent=publicDto(row.published_content);if(!publicContent)throw new InquiryError(404,'showroom_unavailable');
  const context=normalizeInquiryContext(input.request_context,publicContent,row.property_id);
  const memo=[inquiryContextText(context),data.memo].filter(Boolean).join('\n\n');if(memo.length>2000)throw new InquiryError(400,'inquiry_context_too_long');
  data.memo=memo;contextProperty=row.property_id;contextRevision=row.published_revision;
 }
 const fingerprint=await hash(config.key+':inquiry:'+JSON.stringify({slug,...data}));const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);const rateKey=await hash(config.key+':inquiry-rate:'+ip);
 const result=contextProperty?await rpc('crm_register_context_inquiry',{p_request_id:input.request_id,p_fingerprint:fingerprint,p_rate_key:rateKey,p_slug:slug,p_expected_property:contextProperty,p_expected_revision:contextRevision,p_data:data}):await rpc('crm_register_inquiry',{p_request_id:input.request_id,p_fingerprint:fingerprint,p_rate_key:rateKey,p_slug:slug,p_property_id:null,p_admin:false,p_data:data});
 await notify(result.id);return reply({accepted:true,request_id:input.request_id},202);
 }catch(error){return failure(error,reply);}};}
declare const Deno:{env:{get(n:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
declare const EdgeRuntime:{waitUntil(work:Promise<unknown>):void};
if(typeof Deno!=='undefined')Deno.serve(createInquiryHandler({...previewEnvironment(Deno.env),url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,telegramToken:Deno.env.get('TELEGRAM_TOKEN'),telegramChat:Deno.env.get('TELEGRAM_CHAT_ID'),defer:typeof EdgeRuntime==='undefined'?undefined:work=>EdgeRuntime.waitUntil(work)}));
