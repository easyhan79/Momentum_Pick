import {previewConfigured,previewOriginAllowed,previewOwnerAllowed,previewEnvironment} from '../_shared/deployment.ts';
import {publicDecision} from '../_shared/customer-decision.ts';
import {documentCandidates,documentReviewVersion,checkedDocumentCandidates,documentInspectionSummaries,documentAnalysisState,documentIssues,importDocumentCandidates} from '../_shared/document-review.ts';
import {validateImageSettings,imageSettingsReady,imageSettingSlots,ImageSettingsError} from '../_shared/image-settings.ts';
import {validateConceptEdits,changedConceptSlots,ConceptError} from '../_shared/concept-edits.ts';
import {registrationDraft,registrationContact,registrationIssues,webAnalysisInput,intakeInput,intakeDraft} from '../_shared/web-registration.ts';
import {validateProfile,ProfileError,profilePublicationIssues,visibleField} from '../_shared/property-profile.ts';
import {originAllowed,corsOrigin,validSlug,slugSuggestions} from '../_shared/site.ts';
import {publicationIssues} from '../_shared/publication.ts';
import {queuePlan,dispatchPlan} from '../_shared/plan-queue.ts';
import {naturalCustomerCopy,customerCopyReview} from '../_shared/customer-copy.ts';
import {rewriteSnapshot,rewriteJob,selectedRewriteFields,dispatchRewrite} from '../_shared/copy-rewrite.ts';
import {ProcessingError,queueWebProcessing,webProcessingStatus,applyWebProcessing} from '../_shared/web-processing.ts';
// No client-supplied claims are trusted. Auth is checked against GoTrue on every request.
// Only explicitly approved snapshots may be published; original properties are never written.
type Json = Record<string, any>;
const ORIGIN = 'https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (v: unknown): Json => v && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
const text = (v: unknown, limit = 2000): string => typeof v === 'string' ? v.trim().slice(0, limit) : '';
export function headline(value:unknown){return naturalCustomerCopy(text(value,2000)).replace(/\\n/g,'\n').split('\n').map(s=>s.trim()).find(s=>s&&!s.startsWith('■'))?.slice(0,100)||'매물 정보 확인 필요';}
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
  return {visualMode:'ai_generated',schema_version:'1.0',id:property.id,category:/공장|물류|창고/.test(category)?'industrial':/토지|임야/.test(category)?'land':/건물|수익형/.test(category)?'income':/상가|오피스/.test(category)?'commercial':'unknown',
    title:'매물 검토 초안',subtitle:headline(ai.landing_copy),
    summary:naturalCustomerCopy(text(ai.usp_summary)),address:text(property.address,300)||undefined,addressEvidence:'owner_provided',
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
type Config = {url:string;key:string;fetcher?:typeof fetch;githubTokens?:string[];copyRewriteEnabled?:boolean;adminWebEnabled?:boolean;webProcessingEnabled?:boolean;apiImagesEnabled?:boolean;workerEnvironment?:string;privatePreview?:boolean;previewOwnerId?:string;previewOrigin?:string};
export function createHandler({url,key,fetcher=fetch,githubTokens=[],copyRewriteEnabled=false,adminWebEnabled=false,webProcessingEnabled=false,apiImagesEnabled=false,workerEnvironment='production',privatePreview=false,previewOwnerId='',previewOrigin=''}:Config) {
  const previewConfig={url,privatePreview,previewOwnerId,previewOrigin};
  const allowed=(origin:string|null)=>privatePreview?previewOriginAllowed(previewConfig,origin):originAllowed(origin);
  const cors=(origin:string|null)=>privatePreview?(allowed(origin)?origin:undefined):corsOrigin(origin);
  async function db(path:string, options:RequestInit={}) {
    const response=await fetcher(`${url}/rest/v1/${path}`,{...options,redirect:'error',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});
    if(!response.ok){const e=await response.json().catch(()=>({}));const code=e.code==='23505'?'slug_taken':e.message;if(['manual_image_selected','manual_image_already_selected','processing_pending','processing_stale','processing_request_conflict','processing_not_ready'].includes(code))throw new ApiError(409,code);if(code==='processing_rate_limited')throw new ApiError(429,code);if(code==='processing_missing')throw new ApiError(404,code);if(['invalid_processing_request','invalid_processing_result','web_source_required'].includes(code))throw new ApiError(400,code);if(['web_write_conflict','web_form_closed','web_form_open'].includes(code))throw new ApiError(409,code);if(code==='web_source_invalid')throw new ApiError(400,code);if(code==='rewrite_rate_limited')throw new ApiError(429,code);if(['rewrite_busy','rewrite_stale','rewrite_not_ready','rewrite_request_conflict'].includes(code))throw new ApiError(409,code);if(code==='rewrite_missing')throw new ApiError(404,code);if(code==='rewrite_invalid')throw new ApiError(400,code);if(['source_missing','draft_missing','concept_missing','invalid_slot','invalid_registration','web_intake_missing'].includes(code))throw new ApiError(400,code);if(['slug_taken','revision_conflict','invalid_slug','invalid_listing_state','registration_request_conflict','analysis_already_running','concept_image_busy'].includes(code))throw new ApiError(code.startsWith('invalid_')?400:409,code);throw new ApiError(502,'database_unavailable');}
    const responseText=await response.text();
    return responseText.trim()?JSON.parse(responseText):null;
  }
  async function generationReady(draft:Json,id:string){if(!draft.imageSettings)return;
    const sources=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,kind,source_type`);
    const settings=validateImageSettings(draft.imageSettings,sources);if(!imageSettingsReady(settings))throw new ApiError(400,'image_source_required');
  }
  return async function handler(req:Request):Promise<Response> {
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(cors(req.headers.get('Origin'))) Object.assign(headers,{'Access-Control-Allow-Origin':cors(req.headers.get('Origin'))!,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'});
    const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(!previewConfigured(previewConfig))return reply({error:'preview_configuration_required'},503);
    if(!allowed(req.headers.get('Origin'))) return reply({error:'origin_denied'},403);
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    try {
      if(!['GET','POST','PATCH'].includes(req.method)) throw new ApiError(405,'method_not_allowed');
      const bearer=req.headers.get('Authorization')||'';
      if(!/^Bearer \S+$/.test(bearer)) throw new ApiError(401,'login_required');
      const auth=await fetcher(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!auth.ok) throw new ApiError(401,'login_required');
      const user=await auth.json();
      if(!user.id||user.is_anonymous||object(user.app_metadata).showroom_admin!==true) throw new ApiError(403,'admin_required');
      if(!previewOwnerAllowed(previewConfig,user.id))return reply({error:'owner_required'},403);
      const query=new URL(req.url).searchParams;
      if(req.method==='GET'&&query.get('action')==='web-intake-config')return reply({enabled:adminWebEnabled,processingEnabled:webProcessingEnabled,manualImagesEnabled:adminWebEnabled,apiImagesEnabled});
      if(req.method==='GET'&&query.get('action')==='processing-status'){
        if(!adminWebEnabled)throw new ApiError(503,'web_intake_unavailable');const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        return reply(await webProcessingStatus(db,id,user.id,webProcessingEnabled,workerEnvironment));
      }
      if(req.method==='GET'&&query.get('action')==='intake-receipt'){
        if(!adminWebEnabled)throw new ApiError(503,'web_intake_unavailable');
        const requestId=query.get('requestId'),propertyId=query.get('propertyId');
        if((!!requestId===!!propertyId)||!UUID.test(requestId||propertyId||''))throw new ApiError(400,'invalid_registration');
        const result=await db('rpc/web_intake_receipt',{method:'POST',body:JSON.stringify({p_actor:user.id,p_request:requestId,p_property:propertyId})});
        if(!result)throw new ApiError(404,'intake_not_found');return reply(result);
      }
      if(req.method==='GET'&&query.get('action')==='list') {
        const rows=await db('properties?status=neq.merged&select=id,address,status,created_at&order=created_at.desc&limit=100');
        if(query.get('includeWeb')==='1'){
          try{const ids=rows.map((p:Json)=>p.id).filter((id:string)=>UUID.test(id));const intakes=ids.length?await db(`property_web_intakes?property_id=in.(${ids.join(',')})&select=property_id,state`):[];const details=adminWebEnabled&&webProcessingEnabled&&ids.length?await db('rpc/web_intake_listing',{method:'POST',body:JSON.stringify({p_actor:user.id,p_ids:ids})}):[];return reply({properties:rows.map((p:Json)=>({...p,web_state:intakes.find((w:Json)=>w.property_id===p.id)?.state,...details.find((d:Json)=>d.property_id===p.id)})),registration_available:true});}
          catch{return reply({properties:rows,registration_available:false});}
        }
        return reply({properties:rows});
      }
      if(req.method==='GET'&&query.get('action')==='publish-readiness') {
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=revision,showroom_status,draft_content`);if(!rooms.length)throw new ApiError(404,'draft_not_found');
        const media=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,kind`);
        const jobs=await db(`property_image_jobs?property_id=eq.${id}&select=state`);
        return reply({revision:rooms[0].revision,issues:publicationIssues(rooms[0],media,jobs)});
      }
      if(req.method==='GET'&&query.get('action')==='draft') {
        const id=query.get('propertyId')||'';if(!UUID.test(id)) throw new ApiError(400,'invalid_property_id');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`);
        if(!rows.length) throw new ApiError(404,'draft_not_found');
        return reply({showroom:rows[0]});
      }
      if(req.method==='GET'&&query.get('action')==='document-review'){
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const rows=await db(`properties?id=eq.${id}&select=ai_contents`);if(!rows.length)throw new ApiError(404,'property_not_found');
        const ai=object(rows[0].ai_contents),candidates=await checkedDocumentCandidates(ai,id);
        const jobs=await db(`property_analysis_jobs?property_id=eq.${id}&select=state,attempts,last_error_code`);
        return reply({sourceVersion:await documentReviewVersion(ai),candidates,issues:documentIssues(candidates),documents:documentInspectionSummaries(ai),analysis:documentAnalysisState(jobs[0])});
      }
      if(req.method==='GET'&&query.get('action')==='copy-rewrites'){
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        if(!copyRewriteEnabled)return reply({available:false,jobs:[]});
        const rows=await db(`property_copy_rewrites?property_id=eq.${id}&select=id,base_revision,fields,instruction,state,attempts,last_error_code,original,result,created_at,updated_at&order=created_at.desc&limit=10`);
        return reply({available:true,jobs:rows.map(rewriteJob)});
      }
      if(req.method==='GET'&&query.get('action')==='marketing') {
        const id=query.get('propertyId')||'';if(!UUID.test(id))throw new ApiError(400,'invalid_property_id');
        const properties=await db(`properties?id=eq.${id}&select=id,status,ai_contents`);
        if(!properties.length)throw new ApiError(404,'property_not_found');
        if(properties[0].status!=='analyzed')throw new ApiError(409,'analysis_not_ready');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=draft_content`);
        return reply({content:marketingContent(properties[0].ai_contents,object(rooms[0]?.draft_content).marketing),copyReview:customerCopyReview(properties[0].ai_contents)});
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
      if(req.method==='POST'&&body.action==='create-property'){
        if(!UUID.test(body.requestId||''))throw new ApiError(400,'invalid_registration');
        if(adminWebEnabled){const result=await db('rpc/web_create_intake',{method:'POST',body:JSON.stringify({p_request:body.requestId,p_actor:user.id,p_content:intakeDraft(body.input,user.id),p_input:intakeInput(body.input)})});return reply(result);}
        const content=registrationDraft(body.input,user.id);
        const created=await db('rpc/web_create_property',{method:'POST',body:JSON.stringify({p_request:body.requestId,p_actor:user.id,p_content:content})});
        const rooms=await db(`property_showrooms?property_id=eq.${created.property_id}&select=*`);
        if(!rooms.length)throw new ApiError(503,'database_unavailable');
        return reply({showroom:rooms[0],duplicate:created.duplicate});
      }
      const id=body.propertyId;if(typeof id!=='string'||!UUID.test(id)) throw new ApiError(400,'invalid_property_id');
      if(req.method==='POST'&&body.action==='select-manual-image'){
        if(!adminWebEnabled)throw new ApiError(503,'web_processing_unavailable');if(!Number.isSafeInteger(body.revision)||body.revision<1||!['hero','concept-1','concept-2','concept-3'].includes(body.slot)||body.assetId!==null&&!UUID.test(body.assetId||''))throw new ApiError(400,'invalid_processing_request');return reply({showroom:await db('rpc/web_select_manual_image',{method:'POST',body:JSON.stringify({p_property:id,p_revision:body.revision,p_slot:body.slot,p_asset:body.assetId})})});
      }
      if(req.method==='POST'&&['apply-web-processing','cancel-web-processing'].includes(body.action)){
        if(!adminWebEnabled||!webProcessingEnabled)throw new ApiError(503,'web_processing_unavailable');
        if(body.action==='apply-web-processing')return reply(await applyWebProcessing(db,id,user.id,body,result=>toDraft({id,ai_contents:result}),marketingContent));
        if(!UUID.test(body.runId||''))throw new ApiError(400,'invalid_processing_request');return reply(await db('rpc/web_cancel_processing',{method:'POST',body:JSON.stringify({p_property:id,p_actor:user.id,p_run:body.runId})}));
      }
      if(req.method==='POST'&&['save-web-intake','save-web-source'].includes(body.action)){
        if(!adminWebEnabled)throw new ApiError(503,'web_intake_unavailable');
        if(!UUID.test(body.requestId||'')||!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647)throw new ApiError(400,'invalid_registration');
        const source=intakeInput(body.input);
        if(body.action==='save-web-source'){
          if(!Number.isSafeInteger(body.sourceRevision)||body.sourceRevision<0)throw new ApiError(400,'web_source_invalid');
          return reply(await db('rpc/web_save_source',{method:'POST',body:JSON.stringify({p_property:id,p_actor:user.id,p_revision:body.revision,p_source_revision:body.sourceRevision,p_request:body.requestId,p_input:source})}));
        }
        if(typeof body.finish!=='boolean')throw new ApiError(400,'invalid_registration');
        const form=intakeDraft(body.input,user.id),args={p_property:id,p_actor:user.id,p_revision:body.revision,p_request:body.requestId,p_input:source,p_form:form,p_finish:body.finish};
        const replay=await db('rpc/web_find_intake_write',{method:'POST',body:JSON.stringify(args)});if(replay)return reply(replay);
        const receipt=await db('rpc/web_intake_receipt',{method:'POST',body:JSON.stringify({p_actor:user.id,p_request:null,p_property:id})});if(!receipt)throw new ApiError(404,'intake_not_found');
        const current=receipt.showroom;if(current.revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const prior=current.draft_content,initial=form.propertyProfile.fields[0];
        const sources=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,source_type`);
        const profile=validateProfile({...prior.propertyProfile,...form.propertyProfile,fields:[initial,...(prior.propertyProfile?.fields||[]).filter((f:any)=>f.id!==initial.id)],highlights:prior.propertyProfile?.highlights||[],sourcePermissions:prior.propertyProfile?.sourcePermissions||[],modules:prior.propertyProfile?.modules},{assets:sources,userId:user.id,now:new Date().toISOString(),previous:prior.propertyProfile});
        const content={...prior,title:form.title,address:form.address,addressEvidence:'owner_provided',category:form.category,propertyProfile:profile,registration:{...prior.registration,...form.registration}};
        return reply(await db('rpc/web_save_intake',{method:'POST',body:JSON.stringify({...args,p_content:content})}));
      }
      if(req.method==='POST'&&['queue-copy-rewrite','apply-copy-rewrite','discard-copy-rewrite'].includes(body.action)){
        if(!copyRewriteEnabled)throw new ApiError(503,'rewrite_unavailable');
        if(!UUID.test(body.requestId||''))throw new ApiError(400,'rewrite_invalid');
        if(body.action==='discard-copy-rewrite')return reply(await db('rpc/copy_rewrite_decide',{method:'POST',body:JSON.stringify({p_id:body.requestId,p_property:id,p_revision:0,p_apply:false})}));
        if(!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647)throw new ApiError(400,'invalid_revision');
        if(body.action==='apply-copy-rewrite'){
          const room=await db('rpc/copy_rewrite_decide',{method:'POST',body:JSON.stringify({p_id:body.requestId,p_property:id,p_revision:body.revision,p_apply:true})});return reply({showroom:room});
        }
        let fields;try{fields=selectedRewriteFields(body.fields);}catch{throw new ApiError(400,'rewrite_invalid');}
        if(typeof body.instruction!=='string'||body.instruction.length>1000)throw new ApiError(400,'rewrite_invalid');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=draft_content,revision`);if(!rows.length)throw new ApiError(404,'draft_not_found');
        if(rows[0].revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const properties=await db(`properties?id=eq.${id}&select=raw_input,ai_contents`);if(!properties.length)throw new ApiError(404,'property_not_found');
        const snapshot=rewriteSnapshot(rows[0].draft_content,properties[0]);
        if(new TextEncoder().encode(JSON.stringify(snapshot.source)).byteLength>80000)throw new ApiError(400,'rewrite_invalid');
        if(adminWebEnabled&&!webProcessingEnabled)throw new ApiError(503,'web_processing_unavailable');
        if(adminWebEnabled&&rows[0].draft_content.registration?.channel==='web'){const intake=await db('rpc/web_intake_receipt',{method:'POST',body:JSON.stringify({p_actor:user.id,p_property:id,p_request:null})});if(!intake?.receipt.sourceAvailable)throw new ApiError(400,'web_source_required');(snapshot.source as Json).providedText=intake.receipt.providedText.replace(/\[(?:FILE|DOCUMENT)_ID:[^\]]*\]/g,'');}
        const queued=await db('rpc/'+(adminWebEnabled?'web_copy_rewrite_queue':'copy_rewrite_queue'),{method:'POST',body:JSON.stringify({p_id:body.requestId,p_property:id,p_actor:user.id,p_revision:body.revision,p_fields:fields,p_instruction:body.instruction.trim(),p_source:snapshot.source,p_original:Object.fromEntries(fields.map(f=>[f,snapshot.original[f]]))})});
        return reply({...queued,dispatched:!adminWebEnabled&&queued.queued?await dispatchRewrite(githubTokens,fetcher):false});
      }
      if(req.method==='POST'&&body.action==='import-document-facts'){
        if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new ApiError(400,'invalid_revision');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=*`);if(!rows.length)throw new ApiError(404,'draft_not_found');
        const current=rows[0];if(current.revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const properties=await db(`properties?id=eq.${id}&select=ai_contents`);
        const version=await documentReviewVersion(object(properties[0]?.ai_contents));if(body.sourceVersion!==version)throw new ApiError(409,'document_result_changed');
        if(!current.draft_content.propertyProfile)throw new ApiError(400,'profile_required');
        const imported=Array.isArray(current.draft_content.documentReview?.imported)?current.draft_content.documentReview.imported:[];
        const tokens=Array.isArray(body.indices)?body.indices.map((i:unknown)=>`${version}:${i}`):[];
        if(tokens.some((token:string)=>imported.includes(token)))throw new ApiError(409,'document_already_imported');
        const sourceRows=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.document&source_type=neq.ai_generated&select=id`);
        const declared=object(properties[0]?.ai_contents)._document_sources;
        const sources=new Map<number,string>((Array.isArray(declared)?declared:[]).filter((s:Json)=>s.property_id===id&&sourceRows.some((a:Json)=>a.id===s.asset_id)).map((s:Json)=>[s.source_index,s.asset_id]));
        const candidates=await checkedDocumentCandidates(object(properties[0]?.ai_contents),id);
        const profile=importDocumentCandidates(current.draft_content.propertyProfile,candidates,body.indices,sources);
        const added=profile.fields.slice(current.draft_content.propertyProfile.fields.length);
        const history=Array.isArray(current.draft_content.documentReview?.entries)?current.draft_content.documentReview.entries:[];
        const now=new Date().toISOString();
        const entries=body.indices.map((index:number,i:number)=>{const candidate=candidates.find(c=>c.index===index)!;return {fieldId:added[i].id,sourceVersion:version,candidateIndex:index,sourceIndex:candidate.sourceIndex,page:candidate.page,quote:candidate.quote,sourceCheck:candidate.sourceCheck||'not_checked',assetId:sources.get(candidate.sourceIndex)||null,by:user.id,at:now};});
        const content={...current.draft_content,propertyProfile:profile,documentReview:{imported:[...imported,...tokens].slice(-200),entries:[...history,...entries].slice(-200)}};
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=*`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length)throw new ApiError(409,'revision_conflict');return reply({showroom:saved[0]});
      }
      if(req.method==='POST'&&['queue-web-analysis','apply-web-analysis'].includes(body.action)){
        if(adminWebEnabled){if(!webProcessingEnabled)throw new ApiError(503,'web_processing_unavailable');if(body.action!=='queue-web-analysis')throw new ApiError(409,'processing_use_result');return reply({...await queueWebProcessing(db,id,user.id,body),executor:'web_worker',dispatched:false});}
        if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new ApiError(400,'invalid_revision');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=*`);
        if(!rows.length)throw new ApiError(404,'draft_not_found');
        const current=rows[0];if(current.revision!==body.revision)throw new ApiError(409,'revision_conflict');
        if(object(current.draft_content).registration?.channel!=='web')throw new ApiError(400,'web_intake_missing');
        if(body.action==='queue-web-analysis'){
          if(current.draft_content.registration.rightsApproved!==true)throw new ApiError(400,'registration_rights_required');
          let inputSource;
          if(adminWebEnabled){const receipt=await db('rpc/web_intake_receipt',{method:'POST',body:JSON.stringify({p_actor:user.id,p_request:null,p_property:id})});if(!receipt||!receipt.receipt.sourceAvailable)throw new ApiError(400,'web_source_required');if(!receipt.receipt.formClosed)throw new ApiError(409,'web_form_open');inputSource={providedText:receipt.receipt.providedText};}
          const selected=current.draft_content.registration.analysisDocumentIds;
          if(selected!==undefined&&(!Array.isArray(selected)||selected.length>12||new Set(selected).size!==selected.length||selected.some((s:unknown)=>typeof s!=='string'||!UUID.test(s))))throw new ApiError(400,'invalid_document_selection');
          const documents=Array.isArray(selected)&&!selected.length?[]:await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.document&source_type=neq.ai_generated&storage_path=like.*.pdf${Array.isArray(selected)?`&id=in.(${selected.join(',')})`:''}&select=id&order=created_at.asc&limit=13`);
          if(Array.isArray(selected)&&documents.length!==selected.length)throw new ApiError(400,'profile_source_missing');
          if(documents.length>12)throw new ApiError(400,'too_many_documents');
          const raw=webAnalysisInput(current.draft_content,inputSource)+'\n'+documents.map((d:Json)=>`[DOCUMENT_ID:${d.id}]`).join('\n');
          const queued=await db('rpc/web_queue_analysis',{method:'POST',body:JSON.stringify({p_property:id,p_revision:body.revision,p_raw:raw})});
          return reply({...queued,dispatched:queued.queued?await dispatchPlan(githubTokens,fetcher):false});
        }
        const properties=await db(`properties?id=eq.${id}&select=id,address,status,ai_contents`);
        if(properties[0]?.status!=='analyzed')throw new ApiError(409,'analysis_not_ready');
        const generated=toDraft(properties[0]);
        if(!generated.concepts.length)throw new ApiError(400,'analysis_concepts_missing');
        const content={...current.draft_content,concepts:generated.concepts,unknowns:[...new Set([...(current.draft_content.unknowns||[]),...generated.unknowns])]};
        const slots=changedConceptSlots(current.draft_content.concepts||[],content.concepts);
        if(slots.length){const room=await db('rpc/showroom_save_concept_draft',{method:'POST',body:JSON.stringify({p_property:id,p_revision:body.revision,p_content:content,p_slots:slots})});return reply({showroom:room});}
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=*`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length)throw new ApiError(409,'revision_conflict');return reply({showroom:saved[0]});
      }
      if(req.method==='POST'&&['set-slug','set-listing-state'].includes(body.action)){
        if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new ApiError(400,'invalid_revision');
        if(body.action==='set-slug'){
          if(!validSlug(body.slug))throw new ApiError(400,'invalid_slug');
          return reply({showroom:await db('rpc/spacepick_set_slug',{method:'POST',body:JSON.stringify({p_property:id,p_slug:body.slug,p_revision:body.revision})})});
        }
        if(!['active','closed'].includes(body.listing_state))throw new ApiError(400,'invalid_listing_state');
        return reply({showroom:await db('rpc/spacepick_set_listing_state',{method:'POST',body:JSON.stringify({p_property:id,p_state:body.listing_state,p_revision:body.revision})})});
      }
      if(req.method==='POST'&&body.action==='use-generated-layout'){
        if(!Number.isSafeInteger(body.revision))throw new ApiError(400,'invalid_revision');
        const rows=await db(`property_showrooms?property_id=eq.${id}&select=draft_content,revision`);
        if(!rows.length)throw new ApiError(404,'draft_not_found');if(rows[0].revision!==body.revision)throw new ApiError(409,'revision_conflict');
        const prior=object(rows[0].draft_content),content={...prior,visualMode:'ai_generated',planAnalysis:undefined,concepts:(prior.concepts||[]).map((c:Json)=>({...c,plan:undefined}))};
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=*`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length)throw new ApiError(409,'revision_conflict');return reply({showroom:saved[0]});
      }
      if(req.method==='POST'&&body.action==='generate-package'){
        if(adminWebEnabled)throw new ApiError(400,'web_image_single_only');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=draft_content`);if(!rooms.length)throw new ApiError(404,'draft_not_found');
        await generationReady(rooms[0].draft_content,id);
        const slots=['hero',...(rooms[0].draft_content.concepts||[]).map((c:Json)=>c.id).filter((slot:string)=>['concept-1','concept-2','concept-3'].includes(slot))];
        const jobs=[];for(const slot of [...new Set(slots)])jobs.push(await db('rpc/image_enqueue',{method:'POST',body:JSON.stringify({p_property:id,p_slot:slot,p_retry:false})}));
        await db('rpc/image_sync_assets',{method:'POST',body:JSON.stringify({p_property:id})});
        return reply({jobs,dispatched:jobs.some(j=>j.state==='queued')?await dispatchPlan(githubTokens,fetcher):false});
      }
      if(req.method==='POST'&&body.action==='generate-image'){
        if(adminWebEnabled&&(!webProcessingEnabled||!apiImagesEnabled||body.costConfirmed!==true))throw new ApiError(503,'api_image_opt_in_required');
        if(!['hero','concept-1','concept-2','concept-3'].includes(body.slot)||body.retry!==undefined&&typeof body.retry!=='boolean')throw new ApiError(400,'invalid_image_slot');
        const rooms=await db(`property_showrooms?property_id=eq.${id}&select=draft_content`);if(!rooms.length)throw new ApiError(404,'draft_not_found');await generationReady(rooms[0].draft_content,id);
        const job=await db('rpc/'+(adminWebEnabled?'web_image_enqueue':'image_enqueue'),{method:'POST',body:JSON.stringify({p_property:id,p_slot:body.slot,p_retry:body.retry===true})});
        await db('rpc/image_sync_assets',{method:'POST',body:JSON.stringify({p_property:id})});
        const dispatched=!adminWebEnabled&&job.state==='queued'?await dispatchPlan(githubTokens,fetcher):false;return reply({job,dispatched});
      }
      if(req.method==='POST'&&body.action==='analyze-plan'){
        if(adminWebEnabled){if(!webProcessingEnabled)throw new ApiError(503,'web_processing_unavailable');if(!UUID.test(body.assetId||'')||!Number.isSafeInteger(body.revision))throw new ApiError(400,'invalid_plan');return reply({showroom:await db('rpc/web_queue_plan',{method:'POST',body:JSON.stringify({p_property:id,p_asset:body.assetId,p_revision:body.revision,p_request:crypto.randomUUID()})}),dispatched:false});}
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
          if(registrationIssues(draft).length)throw new ApiError(400,'registration_contact_required');
          if(draft.propertyProfile){
            const sources=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,source_type`);
            const profile=validateProfile(draft.propertyProfile,{assets:sources,userId:user.id,now:new Date().toISOString(),previous:draft.propertyProfile});
            if(profilePublicationIssues(profile,sources,draft.address).length)throw new ApiError(400,'profile_review_required');
            draft.propertyProfile=profile;
          }
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
            draft.assets=selected.map((item:Json)=>{const a=media.find((a:Json)=>a.id===item.id);if(!a)throw new ApiError(400,'invalid_media');return{id:a.id,url:'',kind:a.kind==='provided_plan'?'provided_plan':a.source_type==='ai_generated'?'concept':'photo',alt:text(a.caption),caption:text(a.caption),generated:a.source_type==='ai_generated',...(['concept','plan','photo'].includes(item.imageType)?{imageType:item.imageType}:{}),conceptId:text(item.conceptId,100),zoning:Array.isArray(item.zoning)?item.zoning.filter((p:Json)=>typeof p.zoneId==='string'&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100).slice(0,5):[],approved:true};});
            if(draft.heroAsset){const hero=draft.assets.find((a:Json)=>a.id===draft.heroAsset.id);if(!hero)throw new ApiError(400,'invalid_media');draft.heroAsset=hero;}
          }else if(draft.heroAsset)throw new ApiError(400,'invalid_media');
          const decision=draft.propertyProfile?publicDecision(draft.propertyProfile,draft.propertyProfile.fields.filter((f:any)=>visibleField(f,draft.propertyProfile))):undefined;
          if(decision)draft.customerDecision=decision;else delete draft.customerDecision;
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
        if(rows[0].status!=='analyzed'){
          const existing=await db(`property_showrooms?property_id=eq.${id}&select=*`);
          if(existing[0]?.draft_content?.registration?.channel==='web')return reply({showroom:existing[0]});
          throw new ApiError(409,'analysis_not_ready');
        }
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
        const validated=await validateConceptEdits(concepts,previousConcepts,async planId=>{
          const assets=await db(`property_assets?id=eq.${planId}&property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.provided_plan&source_type=neq.ai_generated&select=id,caption`);
          return assets[0];
        },edits.propertyProfile?.kind||prior.propertyProfile?.kind||prior.category||'unknown');
        let invalidatedSlots=changedConceptSlots(previousConcepts,validated);
        const manualComplete=validated.some(c=>c.plan)&&validated.every(c=>!c.plan||c.zones.every((z:Json)=>z.position));
        const planAnalysis=manualComplete&&['failed','needs_review'].includes(object(prior.planAnalysis).state)?{...prior.planAnalysis,state:'manual_reviewed'}:prior.planAnalysis;
        const content:Json={...prior,planAnalysis,concepts:validated,title:edits.title.trim(),subtitle:edits.subtitle.trim(),summary:edits.summary.trim()};
        if(edits.propertyProfile!==undefined){
          const sources=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,source_type`);
          content.propertyProfile=validateProfile(edits.propertyProfile,{assets:sources,userId:user.id,now:new Date().toISOString(),previous:prior.propertyProfile});
          const kind=content.propertyProfile.kind;
          if(kind!=='unknown')content.category=['factory','logistics'].includes(kind)?'industrial':kind;
          if(typeof edits.address!=='string'||edits.address.length>300)throw new ApiError(400,'invalid_property_profile');
          content.address=edits.address.trim();content.addressEvidence='owner_provided';
          if(prior.registration?.channel==='web'){
            if(edits.registrationRightsConfirmed!==undefined&&typeof edits.registrationRightsConfirmed!=='boolean')throw new ApiError(400,'invalid_registration');
            let analysisDocumentIds=prior.registration.analysisDocumentIds;
            if(Object.hasOwn(edits,'analysisDocumentIds')){
              const selected=edits.analysisDocumentIds;
              if(!Array.isArray(selected)||selected.length>12||new Set(selected).size!==selected.length||selected.some((id:unknown)=>typeof id!=='string'||!UUID.test(id)))throw new ApiError(400,'invalid_document_selection');
              const documents=selected.length?await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.document&source_type=neq.ai_generated&storage_path=like.*.pdf&id=in.(${selected.join(',')})&select=id`):[];
              if(documents.length!==selected.length)throw new ApiError(400,'profile_source_missing');analysisDocumentIds=selected;
            }
            content.registration={channel:'web',rightsApproved:edits.registrationRightsConfirmed??prior.registration.rightsApproved,contact:registrationContact(edits.registrationContact??prior.registration.contact),...(analysisDocumentIds!==undefined?{analysisDocumentIds}:{})};
          }
        }
        if(edits.imageSettings!==undefined){
          const sources=await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&select=id,kind,source_type`);
          content.imageSettings=validateImageSettings(edits.imageSettings,sources);
          invalidatedSlots=[...new Set([...invalidatedSlots,...imageSettingSlots(prior.imageSettings,content.imageSettings,[...previousConcepts,...validated])])];
        }
        if(invalidatedSlots.length){
          const room=await db('rpc/showroom_save_concept_draft',{method:'POST',body:JSON.stringify({p_property:id,p_revision:body.revision,p_content:content,p_slots:invalidatedSlots})});
          return reply({showroom:room});
        }
        const saved=await db(`property_showrooms?property_id=eq.${id}&revision=eq.${body.revision}&select=id,property_id,slug,showroom_status,listing_state,published_revision,draft_content,revision,updated_at`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({draft_content:content,revision:body.revision+1})});
        if(!saved.length) throw new ApiError(409,'revision_conflict');
        return reply({showroom:saved[0]});
      }
      throw new ApiError(400,'invalid_action');
    } catch(error) {
      return reply({error:error instanceof ApiError||error instanceof ProcessingError||error instanceof ProfileError||error instanceof ConceptError||error instanceof ImageSettingsError?error.code:'service_unavailable'},error instanceof ApiError||error instanceof ProcessingError?error.status:error instanceof ProfileError||error instanceof ConceptError||error instanceof ImageSettingsError?400:503);
    }
  };
}
// Supabase injects existing server credentials. They never enter browser code.
declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
if(typeof Deno!=='undefined') Deno.serve(createHandler({...previewEnvironment(Deno.env),url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,copyRewriteEnabled:Deno.env.get('COPY_REWRITE_ENABLED')==='true',adminWebEnabled:Deno.env.get('ADMIN_WEB_ENABLED')==='true',webProcessingEnabled:Deno.env.get('WEB_PROCESSING_ENABLED')==='true',apiImagesEnabled:Deno.env.get('WEB_API_IMAGES_ENABLED')==='true',workerEnvironment:Deno.env.get('WORKER_ENVIRONMENT')||'production',githubTokens:['GITHUB_TOKEN','GH_PAT','GITHUB_PAT','GITHUB_PAT_TOKEN'].map(name=>Deno.env.get(name)||'')}));
