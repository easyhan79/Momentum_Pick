import {webAnalysisInput} from './web-registration.ts';
type Db=(path:string,init?:RequestInit)=>Promise<any>;
type Json=Record<string,any>;
export class ProcessingError extends Error{status:number;code:string;constructor(code:string,status=400){super(code);this.code=code;this.status=status;}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rpc=(db:Db,name:string,args:Json)=>db('rpc/'+name,{method:'POST',body:JSON.stringify(args)});
const text=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';
export async function processingIntake(db:Db,id:string,actor:string){const result=await rpc(db,'web_intake_receipt',{p_actor:actor,p_request:null,p_property:id});if(!result)throw new ProcessingError('intake_not_found',404);return result;}
export async function queueWebProcessing(db:Db,id:string,actor:string,body:Json){
 if(!UUID.test(body.requestId||'')||!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647||!Number.isSafeInteger(body.sourceRevision)||body.sourceRevision<1)throw new ProcessingError('invalid_processing_request');
 const selected=body.documentIds;
 if(selected!==undefined&&(!Array.isArray(selected)||selected.length>12||new Set(selected).size!==selected.length||selected.some((id:unknown)=>typeof id!=='string'||!UUID.test(id))))throw new ProcessingError('invalid_document_selection');
 const spec={draftRevision:body.revision,sourceRevision:body.sourceRevision,documentIds:selected??null};
 const args={p_property:id,p_actor:actor,p_request:body.requestId,p_spec:spec};
 const replay=await rpc(db,'web_processing_receipt',args);if(replay)return replay;
 const current=await processingIntake(db,id,actor),room=current.showroom,receipt=current.receipt,draft=room.draft_content;
 if(room.revision!==body.revision||receipt.sourceRevision!==body.sourceRevision)throw new ProcessingError('revision_conflict',409);
 if(!receipt.formClosed)throw new ProcessingError('web_form_open',409);
 if(!receipt.sourceAvailable||draft.registration?.rightsApproved!==true)throw new ProcessingError('web_source_required');
 const docIds=selected??draft.registration.analysisDocumentIds;
 const documents=Array.isArray(docIds)&&!docIds.length?[]:await db(`property_assets?property_id=eq.${id}&bucket_id=eq.showroom-private-media&kind=eq.document&source_type=neq.ai_generated&storage_path=like.*.pdf${Array.isArray(docIds)?`&id=in.(${docIds.join(',')})`:''}&select=id,created_at,sha256,byte_size&order=created_at.asc&limit=13`);
 if(documents.length>12||Array.isArray(docIds)&&documents.length!==docIds.length)throw new ProcessingError('profile_source_missing');
 const refs=documents.map((d:Json)=>({assetId:d.id,createdAt:d.created_at,sha256:d.sha256||null,bytes:d.byte_size??null}));
 if(refs.reduce((sum:number,d:Json)=>sum+(d.bytes||0),0)>24*1024*1024)throw new ProcessingError('too_many_documents');
 const raw=webAnalysisInput(draft,{providedText:receipt.providedText})+'\n'+refs.map((d:Json)=>`[DOCUMENT_ID:${d.assetId}]`).join('\n');
 return rpc(db,'web_queue_processing',{...args,p_revision:body.revision,p_source_revision:body.sourceRevision,p_raw:raw,p_documents:refs});
}
export function processingRun(row:Json,roomRevision:number,sourceRevision:number){
 const result=row.result&&typeof row.result==='object'?row.result:{};
 return {id:row.id,state:row.state,phase:row.phase,attempts:row.attempts,inputRevision:row.input_revision,sourceRevision:row.source_revision,
  createdAt:row.created_at,updatedAt:row.updated_at,startedAt:row.started_at,completedAt:row.completed_at,
  errorCode:/^[a-z0-9_]{1,60}$/.test(row.last_error_code)?row.last_error_code:'',fresh:row.input_revision===roomRevision&&row.source_revision===sourceRevision,
  preview:['done','applied'].includes(row.state)?{subtitle:text(result.landing_copy,500),summary:text(result.usp_summary,4000),
   target_1_blog:text(result.target_1_blog,18000),target_2_blog:text(result.target_2_blog,18000),insta_caption:text(result.insta_caption,18000),
   concepts:(Array.isArray(result.showroom_concepts)?result.showroom_concepts:[]).slice(0,3).map((c:Json)=>({name:text(c.concept_name,100),headline:text(c.headline,500)})),documentCandidates:Array.isArray(result.document_facts)?result.document_facts.length:0}:null};
}
export async function webProcessingStatus(db:Db,id:string,actor:string,enabled:boolean,environment:string){
 const data=await processingIntake(db,id,actor);
 if(!enabled)return {enabled:false,receipt:data.receipt,runs:[],job:null,worker:{ready:false}};
 if(!['test','staging','production'].includes(environment))throw new ProcessingError('worker_environment_invalid',503);
 const [runs,jobs,workers]=await Promise.all([
  db(`property_processing_runs?property_id=eq.${id}&requested_by=eq.${actor}&select=id,state,phase,attempts,input_revision,source_revision,created_at,updated_at,started_at,completed_at,last_error_code,result&order=created_at.desc&limit=10`),
  db(`property_analysis_jobs?property_id=eq.${id}&select=state,attempts,next_attempt_at,last_error_code,run_id,executor_kind`),
  db(`web_worker_heartbeats?environment=eq.${environment}&select=capabilities,last_seen&order=last_seen.desc&limit=10`)]);
 return {enabled:true,receipt:data.receipt,runs:runs.map((r:Json)=>processingRun(r,data.showroom.revision,data.receipt.sourceRevision)),
  job:jobs[0]?{state:jobs[0].state,attempts:jobs[0].attempts,nextAttemptAt:jobs[0].next_attempt_at,runId:jobs[0].run_id}:null,
  worker:{ready:workers.some((w:Json)=>Array.isArray(w.capabilities)&&w.capabilities.includes('analysis')&&Date.parse(w.last_seen)>Date.now()-60000)}};
}
export async function applyWebProcessing(db:Db,id:string,actor:string,body:Json,build:(result:Json)=>Json,marketing:(ai:unknown,saved?:unknown)=>Json){
 const fields=body.fields,allowed=['subtitle','summary','marketing','concepts','evidence'];
 if(!UUID.test(body.runId||'')||!Number.isSafeInteger(body.revision)||body.revision<1||!Array.isArray(fields)||!fields.length||fields.length>5||new Set(fields).size!==fields.length||fields.some((f:unknown)=>typeof f!=='string'||!allowed.includes(f)))throw new ProcessingError('invalid_processing_request');
 const current=await processingIntake(db,id,actor),rows=await db(`property_processing_runs?id=eq.${body.runId}&property_id=eq.${id}&requested_by=eq.${actor}&select=*`);
 if(!rows.length)throw new ProcessingError('processing_missing',404);const run=rows[0];
 if(run.state==='applied')return {showroom:await rpc(db,'web_apply_processing',{p_property:id,p_actor:actor,p_run:body.runId,p_revision:body.revision,p_content:{},p_slots:[]})};
 if(run.state!=='done')throw new ProcessingError('processing_not_ready',409);
 if(current.showroom.revision!==body.revision||run.input_revision!==body.revision||run.source_revision!==current.receipt.sourceRevision)throw new ProcessingError('processing_stale',409);
 const draft=current.showroom.draft_content,result=run.result,generated=build(result),content={...draft};
 const properties=await db(`properties?id=eq.${id}&select=ai_contents`);
 content.marketing=marketing(properties[0]?.ai_contents,draft.marketing);
 if(fields.includes('subtitle'))content.subtitle=generated.subtitle;
 if(fields.includes('summary'))content.summary=generated.summary;
 if(fields.includes('marketing'))content.marketing=marketing(result);
 let slots:string[]=[];
 if(fields.includes('concepts')){
  const {changedConceptSlots}=await import('./concept-edits.ts');content.concepts=generated.concepts;content.unknowns=[...new Set([...(draft.unknowns||[]),...(generated.unknowns||[])])];slots=changedConceptSlots(draft.concepts||[],generated.concepts);
 }
 return {showroom:await rpc(db,'web_apply_processing',{p_property:id,p_actor:actor,p_run:body.runId,p_revision:body.revision,p_content:content,p_slots:slots,p_evidence:fields.includes('evidence')})};
}
