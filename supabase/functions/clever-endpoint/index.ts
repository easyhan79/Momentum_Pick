// Persist and group Telegram updates before dispatch. Never log payloads or secrets.
type Config={url:string;key:string;githubTokens:string[];repository:string;telegramToken:string;telegramSecret?:string;fetcher?:typeof fetch;log?:(value:string)=>void};
export function createHandler(config:Config){
 const fetcher=config.fetcher||fetch,log=config.log||console.log;
 async function rpc(name:string,body:unknown){const response=await fetcher(`${config.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('database_unavailable');const text=await response.text();return text?JSON.parse(text):null;}
 return async(req:Request)=>{
  if(req.method==='GET'){
   if(req.headers.get('Authorization')!==`Bearer ${config.key}`)return new Response('Unauthorized',{status:401});
   return Response.json({telegram_configured:!!config.telegramToken,dispatch_configured:config.githubTokens.some(Boolean),webhook_secret_configured:!!config.telegramSecret});
  }
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  if(config.telegramSecret&&req.headers.get('x-telegram-bot-api-secret-token')!==config.telegramSecret)return new Response('Forbidden',{status:403});
  if(Number(req.headers.get('content-length')||0)>65536)return new Response('Too large',{status:413});
  let update:any;try{const raw=await req.text();if(new TextEncoder().encode(raw).length>65536)return new Response('Too large',{status:413});update=JSON.parse(raw);}catch{return new Response('Invalid update',{status:400});}
  const message=update.message;if(!message)return new Response('Ignored');
  const text=typeof(message.text||message.caption)==='string'?(message.text||message.caption).trim():'';
  const fileId=message.document?.file_id||message.photo?.at(-1)?.file_id||'';
  if((!text&&!fileId)||text.startsWith('/'))return new Response('Ignored');
  if(!Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(message.message_id)||!Number.isSafeInteger(message.chat?.id))return new Response('Invalid update',{status:400});
  let saved:any;
  try{saved=await rpc('telegram_ingest',{p_update:update.update_id,p_chat:String(message.chat.id),p_message:message.message_id,p_group:message.media_group_id||'',p_text:text,p_file:fileId});}
  catch{log('intake database_failed');return new Response('Database unavailable',{status:503});}
  // Replayed webhooks must not create another property, dispatch or receipt.
  if(saved.duplicate)return Response.json({ok:true,duplicate:true});
  if(!saved.first)return Response.json({ok:true,grouped:true});
  let dispatch='missing_token';
  for(const token of [...new Set(config.githubTokens.filter(Boolean))]){
   try{const response=await fetcher(`https://api.github.com/repos/${config.repository}/actions/workflows/agent.yml/dispatches`,{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'Spacepick-Intake','Content-Type':'application/json'},body:JSON.stringify({ref:'main'}),signal:AbortSignal.timeout(5000),redirect:'error'});dispatch=response.status===204?'accepted':`http_${response.status}`;if(response.status===204)break;}catch{dispatch='network_error';}
  }
  log('intake dispatch='+dispatch);
  try{await rpc('telegram_dispatch_result',{p_property:saved.property_id,p_code:dispatch});}catch{log('intake dispatch_result_failed');}
  if(!config.telegramToken){log('intake acknowledgement=missing_token');return Response.json({ok:true});}
  let receipt:any;
  try{
   receipt=await rpc('telegram_receipt_claim',{p_property:saved.property_id});
   if(receipt){
    let code='network_error',success=false;
    try{const response=await fetcher(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:receipt.chat_id,text:'📝 매물 자료를 저장했습니다. 같은 앨범의 사진은 한 매물로 묶습니다. 분석 대기열에 등록했으며 완료되면 안내합니다. 다시 보내지 않으셔도 됩니다.'}),signal:AbortSignal.timeout(7000),redirect:'error'});const result=await response.json().catch(()=>({}));success=response.ok&&result.ok===true;code=success?'':`telegram_${response.status}`;}catch{}
    await rpc('telegram_receipt_complete',{p_property:receipt.property_id,p_token:receipt.token,p_success:success,p_error:code});
    log('intake acknowledgement='+(success?'sent':code));
   }
  }catch{log('intake acknowledgement=deferred');}
  return Response.json({ok:true});
 };
}
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined'){const env=Deno.env;Deno.serve(createHandler({url:env.get('SUPABASE_URL')||'',key:env.get('SUPABASE_SERVICE_ROLE_KEY')||'',githubTokens:[env.get('SPACEPICK_GITHUB_TOKEN')||'',env.get('GITHUB_TOKEN')||'',env.get('GH_PAT')||''],repository:env.get('GITHUB_REPO')||'easyhan79/Momentum_Pick',telegramToken:env.get('TELEGRAM_TOKEN')||env.get('TELEGRAM_BOT_TOKEN')||env.get('BOT_TOKEN')||'',telegramSecret:env.get('TELEGRAM_WEBHOOK_SECRET')||''}));}
