import {publicDto} from '../_shared/public-showroom-dto.ts';
export {publicDto};
type Json=Record<string,any>;
const obj=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
const str=(v:unknown,n=2000)=>typeof v==='string'?v.slice(0,n):'';
const list=(v:unknown)=>Array.isArray(v)?v:[];
export function createPublicHandler(url:string,key:string,fetcher:typeof fetch=fetch){return async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return reply({error:'method_not_allowed'},405);
 const slug=new URL(req.url).searchParams.get('slug')||'';
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>120)return reply({error:'not_found'},404);
 try{
 let r=await fetcher(`${url}/rest/v1/property_showrooms?slug=eq.${encodeURIComponent(slug)}&showroom_status=eq.published&select=slug,listing_state,published_content,published_revision,approved_by,approved_at,published_at&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)return reply({error:'service_unavailable'},503);
 let rows=await r.json(),row=rows[0];
 if(!row){
   const resolved=await fetcher(`${url}/rest/v1/rpc/spacepick_resolve_slug`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({p_slug:slug}),redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!resolved.ok)return reply({error:'service_unavailable'},503);
   const aliases=await resolved.json(),canonical=aliases[0]?.slug;
   if(!canonical||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(canonical))return reply({error:'not_found'},404);
   r=await fetcher(`${url}/rest/v1/property_showrooms?slug=eq.${encodeURIComponent(canonical)}&showroom_status=eq.published&select=slug,listing_state,published_content,published_revision,approved_by,approved_at,published_at&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok)return reply({error:'service_unavailable'},503);rows=await r.json();row=rows[0];
 }

 if(!row||!row.approved_by||!row.approved_at||!row.published_at||!row.published_revision)return reply({error:'not_found'},404);
 const canonicalSlug=row.slug||slug;
 if(row.listing_state==='closed'){if(new URL(req.url).searchParams.has('image')||new URL(req.url).searchParams.has('plan'))return reply({error:'not_found'},404);return reply({closed:true,listing_state:'closed',canonical_slug:canonicalSlug});}
 const data=publicDto(row.published_content);if(!data)return reply({error:'not_found'},404);
 const params=new URL(req.url).searchParams;
 const assetId=params.get('plan')||params.get('image');
 const media=list(obj(row.published_content).assets).map(obj).filter(a=>a.approved===true&&/^[0-9a-f-]{36}$/i.test(a.id||'')).slice(0,24);
 const imageDto=(a:Json)=>({id:a.id,url:`${url}/functions/v1/public-showroom?slug=${encodeURIComponent(slug)}&image=${a.id}`,alt:str(a.alt),caption:str(a.caption),kind:['photo','provided_plan','concept'].includes(a.kind)?a.kind:'photo',approved:true,generated:a.generated===true,...(['concept','plan','photo'].includes(a.imageType)?{imageType:a.imageType}:{}),conceptId:str(a.conceptId,100),zoning:list(a.zoning).slice(0,5).filter(p=>typeof p.zoneId==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100).map(p=>({zoneId:str(p.zoneId,100),x:p.x,y:p.y}))});
 Object.assign(data,{assets:media.map(imageDto)});
 const heroId=obj(obj(row.published_content).heroAsset).id;
 const hero=media.find(a=>a.id===heroId);if(hero)Object.assign(data,{heroAsset:imageDto(hero)});
 const originals=list(obj(row.published_content).concepts);
 if(assetId){
   if(!/^[0-9a-f-]{36}$/i.test(assetId)||!(originals.some(c=>obj(obj(c).plan).assetId===assetId)||media.some(a=>a.id===assetId)))return reply({error:'not_found'},404);
   const propertyId=obj(row.published_content).id;
   if(!/^[0-9a-f-]{36}$/i.test(propertyId))return reply({error:'not_found'},404);
   const a=await fetcher(`${url}/rest/v1/property_assets?id=eq.${assetId}&property_id=eq.${propertyId}&bucket_id=eq.showroom-private-media&select=storage_path`,{headers:{apikey:key,Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!a.ok)return reply({error:'not_found'},404);const assets=await a.json(),path=assets[0]?.storage_path;
   if(typeof path!=='string'||!new RegExp(`^${propertyId}/[0-9a-f-]+\\.(jpg|png|webp)$`,'i').test(path))return reply({error:'not_found'},404);
   const image=await fetcher(`${url}/storage/v1/object/showroom-private-media/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!image.ok||!['image/jpeg','image/png','image/webp'].includes(image.headers.get('content-type')?.split(';')[0]||''))return reply({error:'not_found'},404);
   return new Response(image.body,{headers:{...headers,'Content-Type':image.headers.get('content-type')!,'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 for(let i=0;i<data.concepts.length;i++){
   const original=obj(originals[i]),plan=obj(original.plan);
   if(/^[0-9a-f-]{36}$/i.test(plan.assetId||''))Object.assign(data.concepts[i],{plan:{assetId:plan.assetId,caption:str(plan.caption),url:`${url}/functions/v1/public-showroom?slug=${encodeURIComponent(slug)}&plan=${plan.assetId}`}});
   data.concepts[i].zones.forEach((z:Json,j:number)=>{const source=obj(list(original.zones)[j]),p=obj(source.position);if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100)z.position={x:p.x,y:p.y};z.evidence=source.evidence==='owner_provided'?'owner_provided':'ai_hypothesis';});
 }
 return reply({showroom:data,canonical_slug:canonicalSlug,listing_state:'active'});
 }catch{return reply({error:'service_unavailable'},503);}
};}
declare const Deno:{env:{get(n:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined')Deno.serve(createPublicHandler(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
