import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../functions/showroom-admin/index.ts';
import {rewriteSnapshot,rewriteJob,selectedRewriteFields} from '../functions/_shared/copy-rewrite.ts';
const actor='10000000-0000-4000-8000-000000000001',property='20000000-0000-4000-8000-000000000002',requestId='30000000-0000-4000-8000-000000000003';
const request=(action:string,extra:Record<string,unknown>={},auth=true)=>new Request('https://x',{method:'POST',headers:{...(auth?{Authorization:'Bearer synthetic'}:{}),'Content-Type':'application/json'},body:JSON.stringify({action,propertyId:property,requestId,revision:1,fields:['summary'],instruction:'짧게',...extra})});
function harness(enabled=true,admin=true){
 const calls:{path:string;body:any}[]=[];let error='';
 const room:any={property_id:property,revision:1,draft_content:{summary:'old',subtitle:'title',title:'매물명',registration:{contact:{phone:'PRIVATE_PHONE'}},propertyProfile:{version:1,kind:'factory',fields:[{key:'power_capacity',value:0,unit:'kW',useApproved:true,status:'provided'},{key:'private',value:'PRIVATE_NO_RIGHTS',useApproved:false,status:'provided'},{key:'guess',value:'PRIVATE_GUESS',useApproved:true,status:'inferred'}]}}};
 const handler=createHandler({url:'https://db',key:'secret',copyRewriteEnabled:enabled,githubTokens:['synthetic'],fetcher:(async(input,init={})=>{const path=String(input),body=init.body?JSON.parse(String(init.body)):undefined;calls.push({path,body});
  if(path.endsWith('/auth/v1/user'))return Response.json({id:actor,app_metadata:{showroom_admin:admin}});
  if(path.includes('github.com/'))return new Response(null,{status:204});
  if(path.includes('/rpc/')){if(error)return Response.json({message:error},{status:400});return Response.json(path.endsWith('queue')?{id:requestId,state:'queued',queued:true}:room);}
  if(path.includes('/property_showrooms?'))return Response.json([room]);
  if(path.includes('/properties?'))return Response.json([{raw_input:'PRIVATE_RAW',ai_contents:{target_1_blog:'old blog'}}]);
  if(path.includes('/property_copy_rewrites?'))return Response.json([{id:requestId,fields:['summary'],state:'done',original:{summary:'old',private:'SECRET'},result:{summary:'new',private:'SECRET'},source:{private:'SECRET'},claim_token:'SECRET',requested_by:'SECRET',last_error_code:'provider_transport'}]);
  throw Error('unexpected path');}) as typeof fetch});return{handler,calls,room,setError:(v:string)=>{error=v;}};
}
test('only administrators may request/read rewrite data; default flag off has no DB/dispatch effect',async()=>{
 for(const [h,r,status] of [[harness(),request('queue-copy-rewrite',{},false),401],[harness(true,false),request('queue-copy-rewrite'),403],[harness(false),request('queue-copy-rewrite'),503]] as const){assert.equal((await h.handler(r)).status,status);assert.ok(!h.calls.some(c=>c.path.includes('/rpc/')||c.path.includes('github.com')));}
 const h=harness(false);const r=await h.handler(new Request(`https://x?action=copy-rewrites&propertyId=${property}`,{headers:{Authorization:'Bearer synthetic'}}));assert.deepEqual(await r.json(),{available:false,jobs:[]});
});
test('queue snapshots saved values, source rights and current revision, ignores forged actor/source; dispatches copy only',async()=>{
 const h=harness();assert.equal((await h.handler(request('queue-copy-rewrite',{actor:'forged',source:'forged'}))).status,200);
 const call=h.calls.find(c=>c.path.endsWith('/copy_rewrite_queue'))!;assert.equal(call.body.p_actor,actor);assert.equal(call.body.p_original.summary,'old');assert.deepEqual(Object.keys(call.body.p_original),['summary']);assert.equal(call.body.p_source.fields[0].value,0);
 assert.doesNotMatch(JSON.stringify(call.body),/PRIVATE_PHONE|PRIVATE_RAW|PRIVATE_NO_RIGHTS|PRIVATE_GUESS|forged/);assert.match(h.calls.find(c=>c.path.includes('github.com'))!.path,/copy-rewrite.yml/);
 assert.ok(!h.calls.some(c=>/analysis_claim|web_queue|image_enqueue/.test(c.path)));
});
test('invalid fields, instruction, revision and request ID cannot queue; backend errors map safely',async()=>{
 for(const extra of [{fields:['image']},{fields:['summary','summary']},{fields:[]},{instruction:'x'.repeat(1001)},{revision:2},{requestId:'not-a-uuid'}]){const h=harness();const response=await h.handler(request('queue-copy-rewrite',extra));assert.ok([400,409].includes(response.status));assert.ok(!h.calls.some(c=>c.path.includes('/rpc/')));}
 for(const [code,status] of [['rewrite_busy',409],['rewrite_stale',409],['rewrite_rate_limited',429],['rewrite_missing',404],['rewrite_invalid',400]] as const){const h=harness();h.setError(code);assert.equal((await h.handler(request('apply-copy-rewrite'))).status,status);}
});
test('apply and discard bind property/request/revision; status projection hides source, tokens and unselected data',async()=>{
 const h=harness();assert.equal((await h.handler(request('apply-copy-rewrite'))).status,200);let call=h.calls.find(c=>c.path.endsWith('/copy_rewrite_decide'))!;assert.deepEqual(call.body,{p_id:requestId,p_property:property,p_revision:1,p_apply:true});
 const d=harness();assert.equal((await d.handler(request('discard-copy-rewrite',{revision:undefined}))).status,200);assert.equal(d.calls.find(c=>c.path.endsWith('/copy_rewrite_decide'))!.body.p_apply,false);
 const status=await h.handler(new Request(`https://x?action=copy-rewrites&propertyId=${property}`,{headers:{Authorization:'Bearer synthetic'}}));const value=await status.json();assert.equal(value.jobs[0].result.summary,'new');assert.doesNotMatch(JSON.stringify(value),/SECRET|claim_token|requested_by|source/);
});
test('legacy source directives cannot trigger downloads; empty saved edits and zero remain intentional',()=>{
 assert.deepEqual(selectedRewriteFields(['summary','subtitle']),['subtitle','summary']);
 const snapshot=rewriteSnapshot({summary:'',subtitle:'old',marketing:{target_1_blog:''}},{raw_input:'제공자료 [FILE_ID:private] [DOCUMENT_ID:private] 0 kW',ai_contents:{target_1_blog:'old'}});
 assert.equal(snapshot.original.target_1_blog,'');assert.doesNotMatch(snapshot.source.legacyProvidedText!,/FILE_ID|DOCUMENT_ID|private/);assert.match(snapshot.source.legacyProvidedText!,/0 kW/);
 assert.equal(rewriteJob({fields:['summary'],state:'running',result:{summary:'premature'}}).result,null);
});
