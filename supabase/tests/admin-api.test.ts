import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,toDraft,headline,marketingContent} from '../functions/showroom-admin/index.ts';
const id='23d0b6b1-f48f-491a-b897-a3d4c749c111';
test('marketing adapter exposes only channel text and preserves intentional empty edits',()=>{
  assert.deepEqual(marketingContent({target_1_blog:'AI',raw_input:'PRIVATE',insta_caption:{}},{target_1_blog:''}),{target_1_blog:'',target_2_blog:'',insta_caption:''});
  assert.equal(marketingContent({target_2_blog:'x'.repeat(19000)}).target_2_blog.length,18000);
});
test('marketing read requires admin and returns only private channel content',async()=>{
  const request=new Request(`https://x.test?action=marketing&propertyId=${id}`,{headers:{Authorization:'Bearer user-token'}});
  const denied=harness({id,app_metadata:{}});assert.equal((await denied.handler(request)).status,403);assert.equal(denied.calls(),0);
  const h=harness({id,app_metadata:{showroom_admin:true}},url=>url.includes('/properties?')?[{status:'analyzed',ai_contents:{target_1_blog:'generated',raw_input:'PRIVATE'}}]:[{draft_content:{marketing:{target_1_blog:'edited'}}}]);
  const response=await h.handler(request);assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.content.target_1_blog,'edited');assert.doesNotMatch(JSON.stringify(payload),/PRIVATE/);
});
test('copy review is admin-only and separated from edited customer channel text',async()=>{
 const request=new Request(`https://x.test?action=marketing&propertyId=${id}`,{headers:{Authorization:'Bearer user-token'}});
 const denied=harness({id,app_metadata:{}});assert.equal((await denied.handler(request)).status,403);assert.equal(denied.calls(),0);
 const h=harness({id,app_metadata:{showroom_admin:true}},url=>url.includes('/properties?')?[{status:'analyzed',ai_contents:{copy_review:[{category:'provided_claim',statement:'제공자 조건',check:'계약서 확인',raw_input:'PRIVATE'}]}}]:[{draft_content:{marketing:{target_1_blog:'관리자 편집 문구'}}}]);
 const payload=await(await h.handler(request)).json();assert.equal(payload.content.target_1_blog,'관리자 편집 문구');
 assert.deepEqual(payload.copyReview,[{category:'provided_claim',statement:'제공자 조건',check:'계약서 확인'}]);assert.doesNotMatch(JSON.stringify(payload),/PRIVATE/);
});
test('marketing saves preserve showroom edits and published snapshot with revision CAS',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(url,init)=>{
    if(init.method==='PATCH'){assert.match(url,/revision=eq.4/);const p=JSON.parse(init.body as string);assert.deepEqual(Object.keys(p).sort(),['draft_content','revision']);assert.equal(p.draft_content.title,'existing');assert.equal(p.draft_content.marketing.target_1_blog,'edited');return[{revision:5}];}
    return[{revision:4,draft_content:{title:'existing'}}];
  });assert.equal((await h.handler(req('PATCH',{action:'save-marketing',propertyId:id,revision:4,content:{target_1_blog:'edited',target_2_blog:'',insta_caption:''},published_content:{bad:true}}))).status,200);
  assert.equal((await h.handler(req('PATCH',{action:'save-marketing',propertyId:id,revision:4,content:{target_1_blog:'x'.repeat(18001),target_2_blog:'',insta_caption:''}}))).status,400);
  const stale=harness({id,app_metadata:{showroom_admin:true}},()=>[{revision:5}]);assert.equal((await stale.handler(req('PATCH',{action:'save-marketing',propertyId:id,revision:4,content:{target_1_blog:'',target_2_blog:'',insta_caption:''}}))).status,409);
});
test('full Korean channel package fits bounded request and oversized payload is rejected',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(_url,init)=>init.method==='PATCH'?[{revision:2}]:[{revision:1,draft_content:{}}]);
  const content={target_1_blog:'가'.repeat(18000),target_2_blog:'나'.repeat(18000),insta_caption:'다'.repeat(18000)};
  assert.equal((await h.handler(req('PATCH',{action:'save-marketing',propertyId:id,revision:1,content}))).status,200);
  assert.equal((await h.handler(req('PATCH',{action:'save-marketing',propertyId:id,revision:1,content,extra:'x'.repeat(200000)}))).status,413);
});
const req=(method='GET',body?:unknown,token='user-token')=>new Request('https://example.test/showroom-admin?action=list',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('Spacepick origins accepted exactly and slug editing uses authenticated revision RPC',async()=>{for(const origin of ['https://spacepick.kr','https://www.spacepick.kr']){const h=harness({id,app_metadata:{showroom_admin:true}},(url,init)=>{assert.match(url,/rpc\/spacepick_set_slug/);assert.deepEqual(JSON.parse(init.body as string),{p_property:id,p_slug:'anseong-logistics',p_revision:4});return{slug:'anseong-logistics',revision:5};});const r=await h.handler(new Request('https://x.test',{method:'POST',headers:{Origin:origin,Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'set-slug',propertyId:id,slug:'anseong-logistics',revision:4})}));assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);}const h=harness({id,app_metadata:{showroom_admin:true}});assert.equal((await h.handler(req('POST',{action:'set-slug',propertyId:id,slug:'admin',revision:4}))).status,400);assert.equal(h.calls(),0);assert.equal((await h.handler(new Request('https://x.test',{headers:{Origin:'https://spacepick.kr.evil.test',Authorization:'Bearer user-token'}}))).status,403);});
function harness(user:unknown,rest:(url:string,init:RequestInit)=>unknown=()=>[]) {
  let calls=0;
  const fetcher=(async(url:unknown,init:RequestInit)=>{
    const path=String(url);if(path.endsWith('/auth/v1/user'))return Response.json(user,{status:user?200:401});
    calls++;const result=rest(path,init);return result===null?new Response(null,{status:201}):Response.json(result);
  }) as typeof fetch;
  return {handler:createHandler({url:'https://db.test',key:'server-test-only',fetcher}),calls:()=>calls};
}
test('missing/invalid sessions cannot reach database',async()=>{
  const h=harness(null);assert.equal((await h.handler(new Request('https://x.test'))).status,401);
  assert.equal((await h.handler(req())).status,401);assert.equal(h.calls(),0);
});
test('user_metadata, anon and ordinary users cannot become admin',async()=>{
  for(const user of [{id,user_metadata:{showroom_admin:true}},{id,app_metadata:{}},{id,is_anonymous:true,app_metadata:{showroom_admin:true}}]){
    const h=harness(user);assert.equal((await h.handler(req())).status,403);assert.equal(h.calls(),0);
  }
});
test('list selects only management summary fields',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(url)=>{assert.match(url,/select=id,address,status,created_at/);assert.doesNotMatch(url,/raw_input|ai_contents/);return[];});
  assert.equal((await h.handler(req())).status,200);
});
test('cross-origin and unsupported actions fail closed',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}});
  assert.equal((await h.handler(new Request('https://x.test',{headers:{Origin:'https://evil.test'}}))).status,403);
  assert.equal((await h.handler(req('POST',{propertyId:id,action:'publish'}))).status,400);
  assert.equal(h.calls(),0);
});
test('malformed data and unready analysis are rejected',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},()=>[{id,status:'pending'}]);
  assert.equal((await h.handler(req('POST',{propertyId:'bad',action:'create-draft'}))).status,400);
  assert.equal((await h.handler(req('POST',{propertyId:id,action:'create-draft'}))).status,409);
});
test('creation ignores duplicates, never overwrites existing drafts or publishes',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(url,init)=>{
    if(url.includes('/properties?'))return[{id,status:'analyzed',ai_contents:{}}];
    if(init.method==='POST') {assert.equal((init.headers as Record<string,string>).Prefer,'resolution=ignore-duplicates,return=minimal');const payload=JSON.parse(init.body as string);assert.equal(payload.property_id,id);assert.equal(payload.showroom_status,undefined);assert.equal(payload.published_content,undefined);return null;}
    return[{id,revision:1}];
  });assert.equal((await h.handler(req('POST',{propertyId:id,action:'create-draft'}))).status,200);
});
test('save uses revision predicate and only updates draft fields',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(url,init)=>{
    if(init.method==='PATCH'){assert.match(url,/revision=eq.2/);const payload=JSON.parse(init.body as string);assert.deepEqual(Object.keys(payload).sort(),['draft_content','revision']);assert.equal(payload.revision,3);assert.equal(payload.draft_content.title,'검토');return[{revision:3}];}
    return[{revision:2,draft_content:{schema_version:'1.0',assets:[]}}];
  });assert.equal((await h.handler(req('PATCH',{propertyId:id,action:'save-draft',revision:2,edits:{title:'검토',subtitle:'가설',summary:'요약'},published_content:{bad:true}}))).status,200);
});
test('concurrent writes return conflict',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},()=>[{revision:3}]);
  assert.equal((await h.handler(req('PATCH',{propertyId:id,action:'save-draft',revision:2,edits:{title:'검토',subtitle:'가설',summary:'요약'}}))).status,409);
});
test('adapter tolerates malformed legacy JSON and does not invent facts/assets',()=>{
  for(const ai_contents of [null,[],{},'bad']){const draft=toDraft({id,ai_contents,raw_input:'PRIVATE [FILE_ID:secret]'});assert.deepEqual(draft.facts,[]);assert.deepEqual(draft.assets,[]);assert.equal(JSON.stringify(draft).includes('PRIVATE'),false);}
  const draft=toDraft({id,ai_contents:{property_category:'공장',showroom_concepts:[{zone_plan:['A','B',null,'C','D','E','F']} ]}});
  assert.equal(draft.category,'industrial');assert.equal(draft.concepts[0].zones.length,5);assert.equal(draft.concepts[0].feasibility,'not_checked');
});
test('upstream failure does not expose secrets or raw error',async()=>{
  const h=createHandler({url:'https://db.test',key:'SECRET',fetcher:(async()=>{throw Error('SECRET');}) as typeof fetch});
  const response=await h(req());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SECRET/);
});
test('headline excludes escaped linebreak briefings and bounds length',()=>{
  assert.equal(headline('짧은 제목\\n\\n■ 설명: 긴 본문'),'짧은 제목');assert.equal(headline('가'.repeat(300)).length,100);
});
test('publishing requires review state and explicit complete checklist',async()=>{
  for(const state of ['draft','in_review']){
    const h=harness({id,app_metadata:{showroom_admin:true}},()=>[{revision:2,showroom_status:state,draft_content:{title:'제목',subtitle:'제목',summary:'요약'}}]);
    assert.equal((await h.handler(req('POST',{propertyId:id,action:'publish',revision:2,review:{}}))).status,state==='draft'?409:400);
  }
});
test('publishing freezes snapshot and records authenticated approver',async()=>{
  const draft={title:'검토 제목',subtitle:'짧은 제목',summary:'검토 요약'};
  const h=harness({id,app_metadata:{showroom_admin:true}},(_url,init)=>{
    if(init.method==='PATCH'){const p=JSON.parse(init.body as string);assert.equal(p.showroom_status,'published');assert.equal(p.approved_by,id);assert.equal(p.published_revision,3);assert.equal(p.published_content.title,draft.title);assert.equal(p.draft_content,undefined);return[{revision:3}];}
    return[{revision:2,showroom_status:'in_review',draft_content:draft}];
  });
  assert.equal((await h.handler(req('POST',{propertyId:id,action:'publish',revision:2,review:{facts:true,rights:true,claims:true,privacy:true,notes:'검토 근거와 공개 범위를 직접 확인했습니다.'}}))).status,200);
});
test('unpublishing preserves snapshot and detects concurrent change',async()=>{
  const h=harness({id,app_metadata:{showroom_admin:true}},(_url,init)=>{
    if(init.method==='PATCH'){const p=JSON.parse(init.body as string);assert.deepEqual(p,{revision:3,showroom_status:'unpublished'});return[];}
    return[{revision:2,showroom_status:'published'}];
  });assert.equal((await h.handler(req('POST',{propertyId:id,action:'unpublish',revision:2}))).status,409);
});

test('AI layout switch cancels reference plan marker with revision CAS and preserves originals and publication',async()=>{
 let patch:any;
 const prior={title:'keep',marketing:{target_1_blog:'keep'},planAnalysis:{state:'queued'},concepts:[{id:'concept-1',plan:{assetId:id},zones:[{id:'z1'}]}]};
 const h=harness({id,app_metadata:{showroom_admin:true}},(url,init)=>{assert.match(url,/property_showrooms/);if(init.method==='PATCH'){assert.match(url,/revision=eq.5/);patch=JSON.parse(init.body as string);return [{revision:6,draft_content:patch.draft_content}];}return [{revision:5,draft_content:prior}];});
 const result=await h.handler(req('POST',{action:'use-generated-layout',propertyId:id,revision:5}));assert.equal(result.status,200);
 assert.equal(patch.draft_content.visualMode,'ai_generated');assert.equal(patch.draft_content.planAnalysis,undefined);assert.equal(patch.draft_content.concepts[0].plan,undefined);assert.deepEqual(patch.draft_content.marketing,prior.marketing);assert.deepEqual(Object.keys(patch).sort(),['draft_content','revision']);
 assert.equal((await h.handler(req('POST',{action:'use-generated-layout',propertyId:id,revision:4}))).status,409);
});
