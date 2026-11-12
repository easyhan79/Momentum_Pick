import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../functions/showroom-admin/index.ts';
import {registrationDraft,registrationIssues,webAnalysisInput} from '../functions/_shared/web-registration.ts';
import {publicDto} from '../functions/public-showroom/index.ts';
const actor='10000000-0000-4000-8000-000000000001',property='20000000-0000-4000-8000-000000000002';
const input=()=>({title:'공장 초안',address:'합성 소재지',summary:'제공 설명 [FILE_ID:not-a-file]',kind:'factory',transaction:'sale',area:100,price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},rightsConfirmed:true,contact:{name:'합성 담당자',phone:'010-0000-0000',publicApproved:true}});
const req=(action:string,body:Record<string,unknown>)=>new Request('https://x',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action,propertyId:property,...body})});
test('registration keeps missing data private, publishes entered core facts once rights are confirmed; analysis excludes contacts and attachment directives',()=>{
 const empty={...input(),area:null,address:'',rightsConfirmed:false,contact:{name:'',phone:'',publicApproved:false}};
 const draft=registrationDraft(empty,actor);assert.equal(draft.propertyProfile.fields[0].value,null);assert.equal(draft.propertyProfile.fields[0].publication,'private');assert.equal(registrationIssues(draft).length,1);
 const populated=registrationDraft(input(),actor);assert.equal(registrationIssues(populated).length,0);assert.equal(populated.propertyProfile.fields[0].publication,'approved','owner decision 2026-11-12: confirmed usage rights publish the entered core area by default');
 const raw=webAnalysisInput(populated);assert.doesNotMatch(raw,/FILE_ID|010-0000|합성 담당자/);assert.match(raw,/100/);
 const dto=publicDto(populated);assert.deepEqual(dto?.publicContact,{name:'합성 담당자',phone:'010-0000-0000'});
 populated.registration.contact.publicApproved=false;assert.equal(publicDto(populated)?.publicContact,undefined);
});
function harness(documents:string[]=[]){
 let room:any={property_id:property,revision:1,draft_content:registrationDraft(input(),actor)};
 const calls:{url:string;body:any}[]=[];
 const handler=createHandler({url:'https://db',key:'synthetic-key',fetcher:(async(url,init={})=>{
  const path=String(url);if(path.endsWith('/auth/v1/user'))return Response.json({id:actor,app_metadata:{showroom_admin:true}});
  const body=init.body?JSON.parse(String(init.body)):undefined;calls.push({url:path,body});
  if(path.endsWith('/rpc/showroom_save_concept_draft')){room={...room,draft_content:body.p_content,revision:room.revision+1};return Response.json(room);}
  if(path.endsWith('/rpc/web_create_property'))return Response.json({property_id:property,duplicate:false});
  if(path.endsWith('/rpc/web_queue_analysis'))return Response.json({queued:true,state:'waiting'});
  if(path.includes('/property_assets?'))return Response.json(documents.filter(id=>!path.includes('id=in.')||path.includes(id)).map(id=>({id,kind:'document',source_type:'owner_provided'})));
  if(path.includes('/property_showrooms?')){if(init.method==='PATCH')room={...room,...body};return Response.json([room]);}
  if(path.includes('/properties?'))return Response.json([{id:property,status:'analyzed',ai_contents:{showroom_concepts:[{concept_name:'가설',zone_plan:['검토 구역']}]}}]);
  return Response.json([]);
 }) as typeof fetch});
 return {handler,calls,room:()=>room};
}
test('create uses authenticated actor and validated content, not caller identity or publication metadata',async()=>{
 const h=harness();const r=await h.handler(req('create-property',{requestId:actor,createdBy:'forged',input:{...input(),published_content:{secret:'no'},created_by:'forged'}}));assert.equal(r.status,200);
 const call=h.calls.find(c=>c.url.endsWith('web_create_property'))!;assert.equal(call.body.p_actor,actor);assert.equal(call.body.p_request,actor);assert.equal(call.body.p_content.published_content,undefined);assert.equal(call.body.p_content.created_by,undefined);
 const bad=await h.handler(req('create-property',{requestId:actor,input:{...input(),area:-1}}));assert.equal(bad.status,400);
});
test('queue requires usage rights and current revision; importing AI concepts preserves facts and user copy',async()=>{
 const h=harness();assert.equal((await h.handler(req('queue-web-analysis',{revision:2}))).status,409);
 h.room().draft_content.registration.rightsApproved=false;assert.equal((await h.handler(req('queue-web-analysis',{revision:1}))).status,400);
 h.room().draft_content.registration.rightsApproved=true;assert.equal((await h.handler(req('queue-web-analysis',{revision:1}))).status,200);
 const queued=h.calls.find(c=>c.url.endsWith('web_queue_analysis'))!;assert.doesNotMatch(queued.body.p_raw,/FILE_ID|합성 담당자/);
 const prior=structuredClone(h.room().draft_content);
 assert.equal((await h.handler(req('apply-web-analysis',{revision:1}))).status,200);
 assert.deepEqual(h.room().draft_content.propertyProfile,prior.propertyProfile);assert.equal(h.room().draft_content.title,prior.title);assert.equal(h.room().draft_content.summary,prior.summary);assert.equal(h.room().draft_content.concepts.length,1);
});

test('selected PDF analysis excludes preserved files and validates selection against the actual property',async()=>{
 const first='30000000-0000-4000-8000-000000000003',second='40000000-0000-4000-8000-000000000004',foreign='50000000-0000-4000-8000-000000000005';
 const h=harness([first,second]);h.room().draft_content.registration.analysisDocumentIds=[second];
 assert.equal((await h.handler(req('queue-web-analysis',{revision:1}))).status,200);
 const queued=h.calls.find(c=>c.url.endsWith('web_queue_analysis'))!;assert.match(queued.body.p_raw,new RegExp(second));assert.doesNotMatch(queued.body.p_raw,new RegExp(first));
 const plain=harness([first]);plain.room().draft_content.registration.analysisDocumentIds=[];
 assert.equal((await plain.handler(req('queue-web-analysis',{revision:1}))).status,200);assert.doesNotMatch(plain.calls.find(c=>c.url.endsWith('web_queue_analysis'))!.body.p_raw,/DOCUMENT_ID/);
 const denied=harness([first]);denied.room().draft_content.registration.analysisDocumentIds=[foreign];
 assert.equal((await denied.handler(req('queue-web-analysis',{revision:1}))).status,400);assert.ok(!denied.calls.some(c=>c.url.endsWith('web_queue_analysis')));
 const saved=harness([first,second]);const before=saved.room().draft_content;
 const edits={title:before.title,subtitle:before.subtitle,summary:before.summary,address:before.address,propertyProfile:before.propertyProfile,concepts:[],analysisDocumentIds:[second]};
 const save=new Request('https://x',{method:'PATCH',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'save-draft',propertyId:property,revision:1,edits})});
 assert.equal((await saved.handler(save)).status,200);assert.deepEqual(saved.room().draft_content.registration.analysisDocumentIds,[second]);
});
