import{backend,body,failure,hash,InquiryError,normalizeInquiry,ORIGIN,originAllowed,POLICY,responseTools,UUID,type Config}from'../_shared/inquiries.ts';
export function createInquiryHandler(config:Config){const {rpc,notify}=backend(config);return async(req:Request)=>{const{headers,reply}=responseTools(req);if(!originAllowed(req.headers.get('Origin')))return reply({error:'origin_denied'},403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{if(req.method==='GET'&&new URL(req.url).searchParams.get('action')==='policy')return reply({policy:POLICY});if(req.method!=='POST')throw new InquiryError(405,'method_not_allowed');const input=await body(req),slug=input.slug;
 if(typeof slug!=='string'||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>120||!UUID.test(input.request_id||''))throw new InquiryError(400,'invalid_input');
 const data=normalizeInquiry(input);const fingerprint=await hash(config.key+':inquiry:'+JSON.stringify({slug,...data}));const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,100);const rateKey=await hash(config.key+':inquiry-rate:'+ip);
 const result=await rpc('crm_register_inquiry',{p_request_id:input.request_id,p_fingerprint:fingerprint,p_rate_key:rateKey,p_slug:slug,p_property_id:null,p_admin:false,p_data:data});
 await notify(result.id);return reply({accepted:true,request_id:input.request_id},202);
 }catch(error){return failure(error,reply);}};}
declare const Deno:{env:{get(n:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
declare const EdgeRuntime:{waitUntil(work:Promise<unknown>):void};
if(typeof Deno!=='undefined')Deno.serve(createInquiryHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,telegramToken:Deno.env.get('TELEGRAM_TOKEN'),telegramChat:Deno.env.get('TELEGRAM_CHAT_ID'),defer:typeof EdgeRuntime==='undefined'?undefined:work=>EdgeRuntime.waitUntil(work)}));
