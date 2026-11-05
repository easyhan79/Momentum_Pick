import {originAllowed,corsOrigin} from '../_shared/site.ts';
import {queuePlan,dispatchPlan} from '../_shared/plan-queue.ts';
// Private media API: no public URLs, signed URLs, or browser database/storage grants.
const ORIGIN='https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site';
const BUCKET='showroom-private-media';
const MAX_FILE=8*1024*1024,MAX_BODY=MAX_FILE+65536;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class MediaError extends Error{status:number;code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
export function imageType(bytes:Uint8Array):{mime:string;ext:string}|null{
  if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return{mime:'image/png',ext:'png'};
  if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{mime:'image/jpeg',ext:'jpg'};
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return{mime:'image/webp',ext:'webp'};
  return null;
}
async function boundedBody(req:Request){
  if(Number(req.headers.get('content-length')||0)>MAX_BODY)throw new MediaError(413,'file_too_large');
  const reader=req.body?.getReader();if(!reader)throw new MediaError(400,'invalid_upload');
  const parts:Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_BODY){await reader.cancel();throw new MediaError(413,'file_too_large');}parts.push(value);}
  const data=new Uint8Array(total);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}return data;
}
export function createAssetsHandler({url,key,fetcher=fetch,githubTokens=[]}:{url:string;key:string;fetcher?:typeof fetch;githubTokens?:string[]}){
  async function upstream(path:string,init:RequestInit={}){return fetcher(`${url}/${path}`,{...init,redirect:'error',headers:{apikey:key,Authorization:`Bearer ${key}`,...init.headers},signal:AbortSignal.timeout(20000)});}
  async function db(path:string,init:RequestInit={}){const r=await upstream(`rest/v1/${path}`,{...init,headers:{'Content-Type':'application/json',...init.headers}});if(!r.ok)throw new MediaError(502,'media_unavailable');const body=await r.text();return body?JSON.parse(body):null;}
  async function privateBucket(){
    let response=await upstream(`storage/v1/bucket/${BUCKET}`);
    if(response.status===404||response.status===400){const created=await upstream('storage/v1/bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:BUCKET,name:BUCKET,public:false,file_size_limit:MAX_FILE,allowed_mime_types:['image/jpeg','image/png','image/webp','application/pdf']})});if(!created.ok&&created.status!==409)throw new MediaError(502,'media_unavailable');response=await upstream(`storage/v1/bucket/${BUCKET}`);}
    if(!response.ok||(await response.json()).public!==false)throw new MediaError(503,'private_bucket_required');
  }
  return async(req:Request)=>{
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(corsOrigin(req.headers.get('Origin')))Object.assign(headers,{'Access-Control-Allow-Origin':corsOrigin(req.headers.get('Origin'))!,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});
    const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(!originAllowed(req.headers.get('Origin')))return reply({error:'origin_denied'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{
      if(!['GET','POST'].includes(req.method))throw new MediaError(405,'method_not_allowed');
      const bearer=req.headers.get('Authorization')||'';if(!/^Bearer \S+$/.test(bearer))throw new MediaError(401,'login_required');
      const auth=await fetcher(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(10000)});if(!auth.ok)throw new MediaError(401,'login_required');
      const user=await auth.json();if(!user.id||user.is_anonymous||user.app_metadata?.showroom_admin!==true)throw new MediaError(403,'admin_required');
      const query=new URL(req.url).searchParams,id=query.get('propertyId')||'',action=query.get('action');if(!UUID.test(id))throw new MediaError(400,'invalid_property_id');
      const properties=await db(`properties?id=eq.${id}&select=id`);if(!properties.length)throw new MediaError(404,'property_not_found');
      if(req.method==='GET'&&action==='documents'){
        const assets=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.${BUCKET}&kind=eq.document&source_type=neq.ai_generated&storage_path=like.*.pdf&select=id,caption&order=created_at.asc&limit=100`);
        return reply({assets});
      }
      if(req.method==='GET'&&action==='list'){const assets=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.${BUCKET}&select=id,kind,source_type,caption,is_approved,created_at&order=created_at.desc&limit=100`);return reply({assets});}
      if(req.method==='GET'&&action==='document'){
        const assetId=query.get('assetId')||'';if(!UUID.test(assetId))throw new MediaError(400,'invalid_asset_id');
        const assets=await db(`property_assets?id=eq.${assetId}&property_id=eq.${id}&bucket_id=eq.${BUCKET}&kind=eq.document&source_type=neq.ai_generated&select=storage_path`);
        const path=assets[0]?.storage_path;if(typeof path!=='string'||!new RegExp(`^${id}/[0-9a-f-]+\\.pdf$`,'i').test(path))throw new MediaError(404,'asset_not_found');
        const response=await upstream(`storage/v1/object/${BUCKET}/${path}`);if(!response.ok)throw new MediaError(404,'asset_not_found');
        const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>MAX_FILE||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new MediaError(415,'invalid_document');
        return new Response(bytes,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="property-document.pdf"','Content-Security-Policy':"default-src 'none'; sandbox"}});
      }
      if(req.method==='GET'&&action==='image'){
        const assetId=query.get('assetId')||'';if(!UUID.test(assetId))throw new MediaError(400,'invalid_asset_id');
        const assets=await db(`property_assets?id=eq.${assetId}&property_id=eq.${id}&bucket_id=eq.${BUCKET}&select=storage_path`);if(!assets.length)throw new MediaError(404,'asset_not_found');
        const path=assets[0].storage_path;if(typeof path!=='string'||!new RegExp(`^${id}/[0-9a-f-]+\\.(jpg|png|webp)$`,'i').test(path))throw new MediaError(404,'asset_not_found');
        const r=await upstream(`storage/v1/object/${BUCKET}/${path}`);if(!r.ok)throw new MediaError(404,'asset_not_found');
        const bytes=new Uint8Array(await r.arrayBuffer());const type=imageType(bytes);if(!type||bytes.length>MAX_FILE)throw new MediaError(415,'invalid_image');
        return new Response(bytes,{headers:{...headers,'Content-Type':type.mime,'Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
      }
      if(req.method==='POST'&&action==='classify'){
        const bytes=await boundedBody(req);if(bytes.length>4096)throw new MediaError(413,'body_too_large');
        let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new MediaError(400,'invalid_metadata');}
        if(!UUID.test(body?.assetId||'')||!['photo','provided_plan','document'].includes(body?.kind))throw new MediaError(400,'invalid_metadata');
        const rows=await db(`property_assets?id=eq.${body.assetId}&property_id=eq.${id}&bucket_id=eq.${BUCKET}&source_type=neq.ai_generated&kind=neq.concept&select=id,kind`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({kind:body.kind})});
        if(!rows.length)throw new MediaError(404,'asset_not_found');return reply({asset:rows[0]});
      }
      if(req.method!=='POST'||action!=='upload')throw new MediaError(400,'invalid_action');
      if(!req.headers.get('content-type')?.startsWith('multipart/form-data;'))throw new MediaError(400,'invalid_upload');
      const bytes=await boundedBody(req);let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();}catch{throw new MediaError(400,'invalid_upload');}
      const file=form.get('file'),kind=form.get('kind'),source=form.get('source_type'),caption=form.get('caption'),defer=form.get('defer_generation');
      if(defer!==null&&!['true','false'].includes(String(defer)))throw new MediaError(400,'invalid_metadata');
      if(!(file instanceof Blob)||file.size===0||file.size>MAX_FILE)throw new MediaError(413,'file_too_large');
      if(!['photo','provided_plan','document'].includes(String(kind))||!['owner_provided','photographed'].includes(String(source))||typeof caption!=='string'||!caption.trim()||caption.length>2000)throw new MediaError(400,'invalid_metadata');
      const fileBytes=new Uint8Array(await file.arrayBuffer()),pdf=kind==='document'&&new TextDecoder().decode(fileBytes.slice(0,5))==='%PDF-',type=pdf?{mime:'application/pdf',ext:'pdf'}:kind==='document'?null:imageType(fileBytes);if(!type||type.mime!==file.type)throw new MediaError(415,'invalid_image');
      await privateBucket();const assetId=crypto.randomUUID(),path=`${id}/${assetId}.${type.ext}`;
      const uploaded=await upstream(`storage/v1/object/${BUCKET}/${path}`,{method:'POST',headers:{'Content-Type':type.mime,'x-upsert':'false','Cache-Control':'max-age=0'},body:fileBytes});if(!uploaded.ok)throw new MediaError(502,'upload_failed');
      try{await db('property_assets',{method:'POST',body:JSON.stringify({id:assetId,property_id:id,kind,source_type:source,caption:caption.trim(),bucket_id:BUCKET,storage_path:path,is_approved:false})});}
      catch{try{await upstream(`storage/v1/object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});}catch{/* Orphan contains only a newly generated private path. */}throw new MediaError(502,'metadata_save_failed');}
      let analysis='not_requested',imageStatus='queue_failed';let dispatchNeeded=false;
      if(defer!=='true'&&kind==='provided_plan'){try{await queuePlan(db,id,assetId);analysis='queued_scheduled';dispatchNeeded=true;}catch{analysis='queue_failed';}}
      if(defer!=='true'&&kind!=='document')try{const job=await db('rpc/image_enqueue',{method:'POST',body:JSON.stringify({p_property:id,p_slot:'hero'})});imageStatus=job.state;dispatchNeeded=dispatchNeeded||job.state==='queued';await db('rpc/image_sync_assets',{method:'POST',body:JSON.stringify({p_property:id})});}catch{/* Source remains stored; administrator can request generation again. */}
      const dispatched=dispatchNeeded?await dispatchPlan(githubTokens,fetcher):false;
      if(analysis==='queued_scheduled'&&dispatched)analysis='queued_immediate';
      return reply({id:assetId,status:'private_review_pending',analysis,imageStatus,dispatched},201);
    }catch(error){return reply({error:error instanceof MediaError?error.code:'media_unavailable'},error instanceof MediaError?error.status:503);}
  };
}
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined')Deno.serve(createAssetsHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,githubTokens:[Deno.env.get('GITHUB_TOKEN')||'',Deno.env.get('GH_PAT')||'']}));
