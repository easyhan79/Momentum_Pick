type Json=Record<string,any>;
const obj=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
const str=(v:unknown,n=2000)=>typeof v==='string'?v.slice(0,n):'';
const list=(v:unknown)=>Array.isArray(v)?v:[];
export function publicDto(value:unknown){
 const d=obj(value);if(d.schema_version!=='1.0'||!str(d.title)||!str(d.subtitle))return null;
 return {schema_version:'1.0',id:str(d.id,100),category:['commercial','industrial','land','income'].includes(d.category)?d.category:'unknown',title:str(d.title,200),subtitle:str(d.subtitle,100),summary:str(d.summary,4000),address:str(d.address,300),addressEvidence:'owner_provided',
 facts:list(d.facts).slice(0,30).map(v=>{const f=obj(v);return{key:str(f.key,100),label:str(f.label,100),value:typeof f.value==='number'&&Number.isFinite(f.value)?f.value:str(f.value,500),unit:str(f.unit,30),evidence:['verified','owner_provided','ai_hypothesis','needs_review'].includes(f.evidence)?f.evidence:'needs_review',source:str(f.source,500)};}),
 concepts:list(d.concepts).slice(0,3).map(v=>{const c=obj(v);return{id:str(c.id,100),conceptName:str(c.conceptName,100),headline:str(c.headline,500),rationale:str(c.rationale),feasibility:'not_checked',zones:list(c.zones).slice(0,5).map(v=>{const z=obj(v);return{id:str(z.id,100),label:str(z.label,100),title:str(z.title,120),body:str(z.body),indoorOutdoor:'unknown'};})};}),unknowns:list(d.unknowns).filter(v=>typeof v==='string').slice(0,30).map(v=>str(v,500)),assets:[]};
}
export function createPublicHandler(url:string,key:string,fetcher:typeof fetch=fetch){return async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store, max-age=0','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return reply({error:'method_not_allowed'},405);
 const slug=new URL(req.url).searchParams.get('slug')||'';
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>120)return reply({error:'not_found'},404);
 try{
 const r=await fetcher(`${url}/rest/v1/property_showrooms?slug=eq.${encodeURIComponent(slug)}&showroom_status=eq.published&select=published_content,published_revision,approved_by,approved_at,published_at&limit=1`,{headers:{apikey:key,Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)return reply({error:'service_unavailable'},503);
 const rows=await r.json(),row=rows[0];
 if(!row||!row.approved_by||!row.approved_at||!row.published_at||!row.published_revision)return reply({error:'not_found'},404);
 const data=publicDto(row.published_content);if(!data)return reply({error:'not_found'},404);
 const assetId=new URL(req.url).searchParams.get('plan');
 const originals=list(obj(row.published_content).concepts);
 if(assetId){
   if(!/^[0-9a-f-]{36}$/i.test(assetId)||!originals.some(c=>obj(obj(c).plan).assetId===assetId))return reply({error:'not_found'},404);
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
 return reply({showroom:data});
 }catch{return reply({error:'service_unavailable'},503);}
};}
declare const Deno:{env:{get(n:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined')Deno.serve(createPublicHandler(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
