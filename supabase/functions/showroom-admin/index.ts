import {originAllowed,corsOrigin,validSlug,slugSuggestions} from '../_shared/site.ts';
import {queuePlan,dispatchPlan} from '../_shared/plan-queue.ts';
// No client-supplied claims are trusted. Auth is checked against GoTrue on every request.
// Only explicitly approved snapshots may be published; original properties are never written.
type Json = Record<string, any>;
const ORIGIN = 'https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const text = (v: unknown, limit = 2000): string => typeof v === 'string' ? v.trim().slice(0, limit) : '';
export function headline(value:unknown){return text(value,2000).replace(/\\n/g,'\n').split('\n').map(s=>s.trim()).find(s=>s&&!s.startsWith('■'))?.slice(0,100)||'매물 정보 확인 필요';}
export function toDraft(property: Json) {
  const ai = object(property.ai_contents);
  const category = text(ai.property_category);
  const unknowns = ['면적·가격·이용권·인허가와 자료 출처 확인 필요', 'AI 문구와 활용 방향은 미검증 가설입니다.'];
  const concepts = (Array.isArray(ai.showroom_concepts) ? ai.showroom_concepts : []).slice(0, 3).map((value: unknown, i: number) => {
    const item = object(value);
    return {id:`concept-${i+1}`,conceptName:text(item.concept_name,100)||'활용 방향 확인 필요',
      headline:text(item.headline,500),rationale:text(item.cost_benefit),feasibility:'not_checked',
      zones:(Array.isArray(item.zone_plan)?item.zone_plan:[]).filter((v:unknown)=>typeof v==='string' && v.trim()).slice(0,5)
        .map((v:string,j:number)=>({id:`zone-${i+1}-${j+1}`,label:`구역 ${j+1}`,title:text(v,120),body:text(v),indoorOutdoor:'unknown'}))};
  });
  if (!concepts.length) unknowns.push('활용 컨셉 자료 확인 필요');
  return {schema_version:'1.0',id:property.id,category:/공장|물류|창고/.test(category)?'industrial':/토지|임야/.test(category)?'land':/건물|수익형/.test(category)?'income':/상가|오피스/.test(category)?'commercial':'unknown',
    title:'매물 검토 초안',subtitle:headline(ai.landing_copy),
    summary:text(ai.usp_summary),address:text(property.address,300)||undefined,addressEvidence:'owner_provided',
    facts:[],concepts,unknowns,assets:[]};
}
class ApiError extends Error {
  status:number; code:string;
  constructor(status:number,code:string){super(code);this.status=status;this.code=code;}
}
const marketingFields=['target_1_blog','target_2_blog','insta_caption'] as const;
export function marketingContent(ai:unknown,saved:unknown={}) {
  const source=object(ai), edits=object(saved);
  return Object.fromEntries(marketingFields.map(field=>[field,text(Object.hasOwn(edits,field)?edits[field]:source[field],18000)]));
}
type Config = {url:string;key:string;fetcher?:typeof fetch;githubTokens?:string[]};
export function createHandler({url,key,fetcher=fetch,githubTokens=[]}:Config) {
  async function db(path:string, options:RequestInit={}) {
    const response=await fetcher(`${url}/rest/v1/${path}`,{...options,redirect:'error',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
    if(!response.ok){const e=await response.json().catch(()=>({}));const code=e.code==='23505'?'slug_taken':e.message;if(['source_missing','draft_missing','concept_missing','invalid_slot'].includes(code))throw new ApiError(400,code);if(['slug_taken','revision_conflict','invalid_slug','invalid_listing_state'].includes(code))throw new ApiError(code.startsWith('invalid_')?400:409,code);throw new ApiError(502,'database_unavailable');}
    const responseText=await response.text();
    return responseText.trim()?JSON.parse(responseText):null;
  }
  return async function handler(req:Request):Promise<Response> {
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(corsOrigin(req.headers.get('Origin'))) Object.assign(headers,{'Access-Control-Allow-Origin':corsOrigin(req.headers.get('Origin'))!,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'});
    const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(!originAllowed(req.headers.get('Origin'))) return reply({error:'origin_denied'},403);
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    try {
      if(!['GET','POST','PATCH'].includes(req.method)) throw new ApiError(405,'method_not_allowed');
      const bearer=req.headers.get('Authorization')||'';
      if(!/^Bearer \S+$/.test(bearer)) throw new ApiError(401,'login_required');
      const auth=await fetcher(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!auth.ok) throw new ApiError(401,'login_required');
      const user=await auth.json();
      if(!user.id||user.is_anonymous||object(user.app_metadata).showroom_admin!==true) throw new ApiError(403,'admin_required');
      const query=new URL(req.url).searchParams;
      if(req.method==='GET'&&query.get('action')==='list') {
        const rows=await db('properties?status=neq.merged&select=id,address,status,created_at&order=created_at.desc&limit=100');
        return reply({properties:rows});
      }
      if(req.method==='GET'&&query.get('action')==='draft') {
        const id=query.get('propertyId')||'';if(!UUID.test(id)) throw new ApiError(400,'invalid_property_id');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`);
        if(!rows.length) throw new ApiError(404,'draft_not_found');
        return reply({showroom:rows[0]});
      }
      if(req.method==='GET'&&query.get('action')==='marketing') {
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const properties=await db(`properties?id=eq.${id}&select=id,status,ai_contents`);
        if(!properties.length)throw new ApiError(404,'property_not_found');
        if(properties[0].status!=='analyzed')throw new ApiError(409,'analysis_not_ready');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=draft_content`);
        return reply({content:marketingContent(properties[0].ai_contents,object(rooms[0]?.draft_content).marketing)});
      }
      if(req.method==='GET'&&query.get('action')==='image-package'){
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const jobs=await db(`property_image_jobs?property_id=eq.${id}&select=id,slot,state,attempts,asset_id,last_error_code,usage&order=updated_at`);
        const budgets=await db(`property_image_budgets?property_id=eq.${id}&select=limit_krw,reserved_krw`);
        return reply({jobs,budget:budgets[0]||{limit_krw:2500,reserved_krw:0}});
      }
      if(req.method==='GET'&&query.get('action')==='slug-info'){
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=slug,listing_state,revision,draft_content`);if(!rooms.length)throw new ApiError(404,'draft_not_found');
        const properties=await db(`properties?id=eq.${id}&select=ai_contents`);
        const aliases=await db(`property_showroom_routes?property_id=eq.${id}&select=slug&order=created_at`);
        return reply({slug:rooms[0].slug,listing_state:rooms[0].listing_state,revision:rooms[0].revision,aliases:aliases.map((a:Json)=>a.slug),suggestions:slugSuggestions(rooms[0].draft_content,id,object(properties[0]?.ai_contents).url_slug_candidates)});
      }
      if(req.method==='GET') throw new ApiError(400,'invalid_action');
      if(Number(req.headers.get('Content-Length')||0)>200000) throw new ApiError(413,'body_too_large');
      const raw=await req.text();const bodyBytes=new TextEncoder().encode(raw).length;if(bodyBytes>200000) throw new ApiError(413,'body_too_large');
      let body:Json;try{body=object(JSON.parse(raw));}catch{throw new ApiError(400,'invalid_json');}
      if(body.action!=='save-marketing'&&bodyBytes>65536)throw new ApiError(413,'body_too_large');
      const id=body.propertyId;if(typeof id!=='string'||!UUID.test(id)) throw new ApiError(400,'invalid_property_id');
      if(req.method==='POST'&&['set-slug','set-listing-state'].includes(body.action)){
        if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new ApiError(400,'invalid_revision');
        if(body.action==='set-slug'){
          if(!validSlug(body.slug))throw new ApiError(400,'invalid_slug');
          return reply({showroom:await db('rpc/spacepick_set_slug',{method:'POST',body:JSON.stringify({p_property:id,p_slug:body.slug,p_revision:body.revision})})});
        }
        if(!['active','closed'].includes(body.listing_state))throw new ApiError(400,'invalid_listing_state');
        return reply({showroom:await db('rpc/spacepick_set_listing_state',{method:'POST',body:JSON.stringify({p_property:id,p_state:body.listing_state,p_revision:body.revision})})});
      }
      if(req.method==='POST'&&body.action==='generate-image'){
        if(!['hero','concept-1','concept-2','concept-3'].includes(body.slot)||body.retry!==undefined&&typeof body.retry!=='boolean')throw new ApiError(400,'invalid_image_slot');
        const job=await db('rpc/image_enqueue',{method:'POST',body:JSON.stringify({p_property:id,p_slot:body.slot,p_retry:body.retry===true})});
        await db('rpc/image_sync_assets',{method:'POST',body:JSON.stringify({p_property:id})});
        const dispatched=job.state==='queued'?await dispatchPlan(githubTokens,fetcher):false;return reply({job,dispatched});
      }
      if(req.method==='POST'&&body.action==='analyze-plan'){
        if(!UUID.test(body.assetId||'')||!Number.isSafeInteger(body.revision))throw new ApiError(400,'invalid_plan');
        let showroom;try{showroom=await queuePlan(db,id,body.assetId,body.revision);}catch(e){throw new ApiError(409,e instanceof Error?e.message:'plan_queue_failed');}
        const dispatched=await dispatchPlan(githubTokens,fetcher);return reply({showroom,dispatched});
      }
      if(req.method==='POST'&&['request-review','publish','unpublish'].includes(body.action)) {
        if(!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647)throw new ApiError(400,'invalid_revision');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=*`);
        if(!rows.length)throw new ApiError(404,'draft_not_found');
        const current=rows[0];if(current.revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const patch:Json={revision:body.revision+1};
        if(body.action==='publish'){
          if(current.showroom_status!=='in_review')throw new ApiError(409,'review_required');
          const review=object(body.review);
          if(!['facts','rights','claims','privacy'].every(k=>review[k]===true)||text(review.notes).length<10)throw new ApiError(400,'checklist_required');
          const draft=object(current.draft_content);
          if(['queued','running','failed'].includes(object(draft.planAnalysis).state))throw new ApiError(409,'plan_analysis_pending');
          if(!text(draft.title)||!text(draft.subtitle)||!text(draft.summary)||draft.subtitle.length>100)throw new ApiError(400,'content_review_required');
          for(const c of (draft.concepts||[])){if(!c.plan)continue;
            if(!c.zones?.length||c.zones.some((z:Json)=>!z.position))throw new ApiError(400,'plan_positions_required');
            const assets=await db(`property_assets?id=eq.${c.plan.assetId}&property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.provided_plan&select=id`);
            if(!assets.length)throw new ApiError(400,'invalid_plan');
          }
          const imageJobs=await db(`property_image_jobs?property_id=eq.${id}&select=state`);
          if(imageJobs.some((j:Json)=>['queued','running'].includes(j.state)))throw new ApiError(409,'image_generation_pending');
          const selected=Array.isArray(draft.assets)?draft.assets:[];
          if(selected.length>24||selected.some((a:Json)=>!UUID.test(a.id||'')))throw new ApiError(400,'invalid_media');
          if(selected.length){
            const media=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,kind,caption,source_type`);
            draft.assets=selected.map((item:Json)=>{const a=media.find((a:Json)=>a.id===item.id);if(!a)throw new ApiError(400,'invalid_media');return{id:a.id,url:'',kind:a.kind==='provided_plan'?'provided_plan':a.source_type==='ai_generated'?'concept':'photo',alt:text(a.caption),caption:text(a.caption),generated:a.source_type==='ai_generated',conceptId:text(item.conceptId,100),approved:true};});
            if(draft.heroAsset){const hero=draft.assets.find((a:Json)=>a.id===draft.heroAsset.id);if(!hero)throw new ApiError(400,'invalid_media');draft.heroAsset=hero;}
          }else if(draft.heroAsset)throw new ApiError(400,'invalid_media');
          const now=new Date().toISOString();
          const record={notes:text(review.notes),checks:{facts:true,rights:true,claims:true,privacy:true},by:user.id,at:now,revision:body.revision+1};
          const prior=object(current.published_content)._reviewHistory;
          Object.assign(patch,{showroom_status:'published',published_content:{...draft,_review:record,_reviewHistory:[...(Array.isArray(prior)?prior:[]),record]},published_revision:body.revision+1,approved_by:user.id,approved_at:now,published_at:now});
        }else patch.showroom_status=body.action==='request-review'?'in_review':'unpublished';
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
        if(!saved.length)throw new ApiError(409,'revision_conflict');return reply({showroom:saved[0]});
      }
      if(req.method==='POST'&&body.action==='create-draft') {
        const rows=await db(`properties?id=eq.${id}&select=id,address,status,ai_contents`);
        if(!rows.length) throw new ApiError(404,'property_not_found');
        if(rows[0].status!=='analyzed') throw new ApiError(409,'analysis_not_ready');
        await db('property_showrooms?on_conflict=property_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({property_id:id,slug:`property-${id}`,draft_content:toDraft(rows[0])})});
        const saved=await db(`property_showrooms?property_id=eq.${id}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`);
        return reply({showroom:saved[0]});
      }
      if(req.method==='PATCH'&&body.action==='save-marketing') {
        if(!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647)throw new ApiError(400,'invalid_revision');
        const edits=object(body.content);
        if(marketingFields.some(field=>typeof edits[field]!=='string'||edits[field].length>18000))throw new ApiError(400,'invalid_edits');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=draft_content,revision`);
        if(!rows.length)throw new ApiError(404,'draft_not_found');
        if(rows[0].revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const content={...object(rows[0].draft_content),marketing:marketingContent({},edits)};
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=revision`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length)throw new ApiError(409,'revision_conflict');
        return reply({revision:saved[0].revision});
      }
      if(req.method==='PATCH'&&body.action==='save-draft') {
        if(!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647) throw new ApiError(400,'invalid_revision');
        const edits=object(body.edits);
        const limits:Record<string,number>={title:200,subtitle:500,summary:4000};
        for(const field of Object.keys(limits)) if(typeof edits[field]!=='string'||!edits[field].trim()||edits[field].length>limits[field]) throw new ApiError(400,'invalid_edits');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=draft_content,revision`);
        if(!rows.length) throw new ApiError(404,'draft_not_found');
        if(rows[0].revision!==body.revision) throw new ApiError(409,'revision_conflict');
        const prior=object(rows[0].draft_content);
        const previousConcepts=Array.isArray(prior.concepts)?prior.concepts:[];const concepts=edits.concepts===undefined?previousConcepts:edits.concepts;
        if(!Array.isArray(concepts)||concepts.length!==previousConcepts.length)throw new ApiError(400,'invalid_concepts');
        const validated=[];
        for(let i=0;i<concepts.length;i++){
          const c=object(concepts[i]),original=previousConcepts[i];
          if(c.id!==original.id||!Array.isArray(c.zones)||c.zones.length!==original.zones.length)throw new ApiError(400,'invalid_concepts');
          let plan;
          if(c.plan){const idPlan=object(c.plan).assetId;if(!UUID.test(idPlan||''))throw new ApiError(400,'invalid_plan');
            const assets=await db(`property_assets?id=eq.${idPlan}&property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.provided_plan&select=id,caption`);
            if(!assets.length)throw new ApiError(400,'invalid_plan');plan={assetId:idPlan,caption:text(assets[0].caption)};}
          const zones=c.zones.map((v:unknown,j:number)=>{const z=object(v),p=object(z.position);if(z.id!==original.zones[j].id||!text(z.label,100)||!text(z.title,120))throw new ApiError(400,'invalid_zone');
            let position;if(z.position){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>100||p.y<0||p.y>100)throw new ApiError(400,'invalid_position');position={x:p.x,y:p.y};}
            return {...original.zones[j],label:text(z.label,100),title:text(z.title,120),body:text(z.body),evidence:z.evidence==='owner_provided'?'owner_provided':'ai_hypothesis',...(position?{position}:{})};});
          validated.push({...original,plan,zones});
        }
        const manualComplete=validated.some(c=>c.plan)&&validated.every(c=>!c.plan||c.zones.every((z:Json)=>z.position));
        const planAnalysis=manualComplete&&['failed','needs_review'].includes(object(prior.planAnalysis).state)?{...prior.planAnalysis,state:'manual_reviewed'}:prior.planAnalysis;
        const content={...prior,planAnalysis,concepts:validated,title:edits.title.trim(),subtitle:edits.subtitle.trim(),summary:edits.summary.trim()};
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length) throw new ApiError(409,'revision_conflict');
        return reply({showroom:saved[0]});
      }
      throw new ApiError(400,'invalid_action');
    } catch(error) {
      return reply({error:error instanceof ApiError?error.code:'service_unavailable'},error instanceof ApiError?error.status:503);
    }
  };
}
// Supabase injects existing server credentials. They never enter browser code.
declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined') Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,githubTokens:[Deno.env.get('GITHUB_TOKEN')||'',Deno.env.get('GH_PAT')||'']}));
