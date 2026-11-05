import {test} from 'node:test';import assert from 'node:assert/strict';
import {documentCandidates,documentVersion,documentIssues,importDocumentCandidates,checkedDocumentCandidates,documentReviewVersion,candidateFingerprint,documentInspectionSummaries,documentAnalysisState} from '../functions/_shared/document-review.ts';
import {validateProfile,profileFacts} from '../functions/_shared/property-profile.ts';
import {createHandler} from '../functions/showroom-admin/index.ts';
import {publicDto} from '../functions/public-showroom/index.ts';
const property='10000000-0000-4000-8000-000000000001';
const raw=[{key:'floor_structure',label:'층수',value:'지상 4층',unit:'',source_index:1,page:7,quote:'지상 4층',missing:false},{key:'floor_structure',label:'층수',value:'지상 3층',unit:'',source_index:1,page:8,quote:'지상 3층',missing:false},{key:'lease_period',label:'계약 종료일',value:'',unit:'',source_index:1,page:11,quote:'2026.06.01~',missing:true}];
const profile=()=>validateProfile({version:1,kind:'factory',transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[],highlights:[],sourcePermissions:[]},{assets:[],userId:property,now:'2026-11-05'});
test('citation checks are bound to the exact candidate and PDF digest, never to a verified fact status',async()=>{
 const c=documentCandidates([raw[0]])[0];
 const ai={document_facts:[raw[0]],_document_inspections:[{source_index:1,sha256:'synthetic-digest',page_count:8,textless_pages:[],limited_pages:[],unreadable_pages:[]}],_document_checks:[{candidate_index:0,fingerprint:await candidateFingerprint(c),source_index:1,page:7,status:'quote_matched',source_sha256:'synthetic-digest'}]};
 const checked=await checkedDocumentCandidates(ai,property);assert.equal(checked[0].sourceCheck,'quote_matched');
 const imported=importDocumentCandidates(profile(),checked,[0]);assert.equal(imported.fields[0].status,'provided');assert.equal(imported.fields[0].publication,'private');
 const changed=structuredClone(ai);changed.document_facts[0].value='지상 5층';
 assert.equal((await checkedDocumentCandidates(changed,property))[0].sourceCheck,'not_checked');
 const replaced=structuredClone(ai);replaced._document_inspections[0].sha256='another-file';
 assert.equal((await checkedDocumentCandidates(replaced,property))[0].sourceCheck,'not_checked');
 assert.notEqual(await documentReviewVersion(ai),await documentReviewVersion(replaced));
 const wrong=structuredClone(ai);wrong._document_checks[0].status='page_out_of_range';
 assert.ok(documentIssues(await checkedDocumentCandidates(wrong,property)).some(i=>i.message.includes('페이지 번호 불일치')));
});
test('Python and JavaScript candidate fingerprints share a fixed cross-runtime contract',async()=>{
 const c=documentCandidates([{key:'land_area',value:'1,000',unit:'m2',source_index:1,page:1,quote:'Site area 1,000 m2',missing:false}])[0];
 assert.equal(await candidateFingerprint(c),'02d8fc9a1fca70721ffbfe66cd353805c49d2c76da7d9ad73375ee2263e42ca2');
});
test('viewer digest belongs to the current property and document source, not a client hint',async()=>{
  const ai={document_facts:[raw[0]],_document_sources:[{property_id:property,source_index:1,asset_id:'20000000-0000-4000-8000-000000000002'}],_document_inspections:[{source_index:1,sha256:'a'.repeat(64),page_count:8}]};
  assert.equal((await checkedDocumentCandidates(ai,property))[0].sourceSha256,'a'.repeat(64));
  assert.equal((await checkedDocumentCandidates(ai,'another-property'))[0].sourceSha256,undefined);
  ai._document_inspections[0].sha256='invalid';
  assert.equal((await checkedDocumentCandidates(ai,property))[0].sourceSha256,undefined);
});
test('document summaries and failure diagnostics expose only bounded actionable information',()=>{
 const ai={_document_inspections:[{source_index:1,page_count:2,textless_pages:[1,999],limited_pages:[],unreadable_pages:[2],text:'PRIVATE_DOCUMENT'}]};
 assert.deepEqual(documentInspectionSummaries(ai),[{sourceIndex:1,pageCount:2,textlessPages:[1],limitedPages:[],unreadablePages:[2]}]);
 assert.deepEqual(documentAnalysisState({state:'failed',attempts:1,last_error_code:'document_pdf_encrypted',claim_token:'PRIVATE'}),{state:'failed',attempts:1,errorCode:'document_pdf_encrypted'});
 assert.deepEqual(documentAnalysisState({state:'failed',attempts:2,last_error_code:'PRIVATE_RAW_ERROR'}),{state:'failed',attempts:2});
});
test('document review preserves conflicting values and missing contract conditions without choosing one',()=>{
 const candidates=documentCandidates(raw),issues=documentIssues(candidates);
 assert.ok(issues.some(i=>i.kind==='conflict'&&i.key==='floor_structure'));assert.ok(issues.some(i=>i.kind==='missing'&&i.key==='lease_period'));
 const imported=importDocumentCandidates(profile(),candidates,[0,1]);assert.equal(imported.fields.length,2);assert.notEqual(imported.fields[0].value,imported.fields[1].value);
 assert.ok(imported.fields.every(f=>f.status==='provided'&&!f.useApproved&&f.publication==='private'));assert.deepEqual(profileFacts(imported),[]);
 assert.throws(()=>importDocumentCandidates(profile(),candidates,[2]));assert.throws(()=>importDocumentCandidates(profile(),candidates,[0,0]));
});
test('candidate input is bounded and source hints are not promoted to verified evidence',async()=>{
 assert.deepEqual(documentCandidates([{key:'<script>'},null]),[]);
 const candidates=documentCandidates([{key:'land_area',label:'면적',value:'1,000',unit:'㎡',page:0,quote:'',source_index:99}]);
 assert.ok(documentIssues(candidates).some(i=>i.kind==='source'));assert.equal(candidates[0].sourceIndex,0);
 assert.equal(importDocumentCandidates(profile(),candidates,[0]).fields[0].value,1000);
 assert.equal(await documentVersion(raw),await documentVersion(structuredClone(raw)));assert.notEqual(await documentVersion(raw),await documentVersion([]));
});
test('import compares analysis version and revision, records duplicate protection, and preserves published content',async()=>{
 let room:any={revision:1,draft_content:{title:'기존',propertyProfile:profile()},published_content:{title:'승인본'}};
 const handler=createHandler({url:'https://db',key:'synthetic',fetcher:(async(url,init={})=>{
   const path=String(url);if(path.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
   if(path.includes('/property_assets?')||path.includes('/property_analysis_jobs?'))return Response.json([]);
   if(path.includes('/properties?'))return Response.json([{ai_contents:{document_facts:raw}}]);
   if(path.includes('/property_showrooms?')){if(init.method==='PATCH'){const patch=JSON.parse(String(init.body));assert.equal(patch.published_content,undefined);room={...room,...patch};}return Response.json([room]);}
   throw Error('unexpected');
 }) as typeof fetch});
 const req=(revision:number,sourceVersion:string)=>new Request('https://x',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'import-document-facts',propertyId:property,revision,sourceVersion,indices:[0,1]})});
 assert.equal((await handler(req(1,'stale'))).status,409);assert.equal((await handler(req(2,await documentVersion(raw)))).status,409);
 assert.equal((await handler(req(1,await documentVersion(raw)))).status,200);assert.equal(room.draft_content.propertyProfile.fields.length,2);assert.deepEqual(room.published_content,{title:'승인본'});
 assert.equal(room.draft_content.documentReview.entries[0].quote,raw[0].quote);assert.equal(room.draft_content.documentReview.entries[0].fieldId,room.draft_content.propertyProfile.fields[0].id);
 const dto=publicDto({...room.draft_content,schema_version:'1.0',title:'공개 요약',subtitle:'공개',concepts:[],assets:[]});assert.equal((dto as any)?.documentReview,undefined);assert.doesNotMatch(JSON.stringify(dto),/sourceVersion|candidateIndex|documentReview/);
 assert.equal((await handler(req(2,await documentVersion(raw)))).status,409);
});
