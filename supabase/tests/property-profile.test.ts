import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProfile,profileFacts,publicProfileHighlights,profilePublicationIssues,ProfileError,profileSummary} from '../functions/_shared/property-profile.ts';
import {createHandler} from '../functions/showroom-admin/index.ts';
import {publicDto,createPublicHandler} from '../functions/public-showroom/index.ts';
import {publicationIssues} from '../functions/_shared/publication.ts';
import {emptyRentalScenario} from '../functions/_shared/rental-scenario.ts';

const property='10000000-0000-4000-8000-000000000001',asset='20000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
const context=()=>({assets:[{id:asset,source_type:'owner_provided'}],userId:'real-reviewer',now:'2026-11-05T13:00:00.000Z'});
const field=(id='area')=>({id,key:'land_area',label:'토지면적',value:100,unit:'㎡',status:'provided',sourceText:'제공자료 · 미검증',sourceIds:[asset],useApproved:true,publication:'approved'});
const input=()=>({version:1,kind:'factory',transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[field()],sourcePermissions:[{assetId:asset,useApproved:true,allowDerivedPublication:true}],highlights:[]});
function profile(){return validateProfile(input(),context());}
const request=(action:string,body:unknown={},method='POST')=>new Request('https://x.test',{method,headers:{Authorization:'Bearer user','Content-Type':'application/json'},body:JSON.stringify({action,propertyId:property,...body as object})});

test('normalization preserves null/zero/units and strips unrecognized client properties',()=>{
  const p=input();p.fields.push({...field('blank'),value:'  ' as any},{...field('zero'),value:0});
  (p as any).privateMetadata='SECRET';const result=validateProfile(p,context());
  assert.equal(result.fields[1].value,null);assert.equal(result.fields[2].value,0);assert.equal(result.fields[0].unit,'㎡');
  assert.equal((result as any).privateMetadata,undefined);
  for(const mutate of [(p:any)=>p.price.saleWon=-1,(p:any)=>p.price.saleWon=1.2,(p:any)=>p.fields[0].value=Infinity,(p:any)=>p.version=2,(p:any)=>p.fields.push(p.fields[0]),(p:any)=>p.fields[0].sourceIds=[other]]){
    const bad=input();mutate(bad);assert.throws(()=>validateProfile(bad,context()),ProfileError);
  }
});
test('verified needs real evidence, method and explicit confirmation; reviewer identity is server controlled',()=>{
  const p:any=input();p.fields[0].status='verified';
  assert.throws(()=>validateProfile(p,context()),ProfileError);
  p.fields[0].verification={method:'제공된 실제 증빙과 면적 값을 대조함',confirmed:true,by:'forged',at:'yesterday'};
  const saved=validateProfile(p,context());assert.equal(saved.fields[0].verification?.by,'real-reviewer');
  assert.equal(saved.fields[0].verification?.at,context().now);
  assert.throws(()=>validateProfile(p,{...context(),assets:[{id:asset,source_type:'ai_generated'}]}),ProfileError);
  const resaved=validateProfile(saved,{...context(),userId:'another-admin',previous:saved});assert.equal(resaved.fields[0].verification?.by,'real-reviewer');
  const changed=structuredClone(saved);changed.fields[0].value=200;assert.throws(()=>validateProfile(changed,{...context(),previous:saved}),ProfileError);
});
test('private facts and source restrictions cannot leak via legacy facts or highlights',()=>{
  const p:any=input();p.fields.push({...field('private'),key:'secret',value:'PRIVATE_VALUE',publication:'private'});
  p.highlights=[{id:'public',title:'제공 면적',description:'검토 대상',fieldIds:['area'],constraints:'제공자료 대조 필요'},{id:'private',title:'PRIVATE_HIGHLIGHT',description:'',fieldIds:['private'],constraints:''}];
  let saved=validateProfile(p,context());
  assert.equal(profileFacts(saved).length,1);assert.equal(profileFacts(saved,true).length,2);assert.equal(publicProfileHighlights(saved).length,1);
  const dto=publicDto({schema_version:'1.0',id:property,title:'공장',subtitle:'검토',facts:[{...field(),value:'LEGACY_SECRET'}],propertyProfile:saved});
  assert.equal(dto?.facts.length,1);assert.doesNotMatch(JSON.stringify(dto),/PRIVATE_|LEGACY_SECRET|sourceIds|sourcePermissions|real-reviewer/);
  saved.sourcePermissions[0].allowDerivedPublication=false;
  assert.deepEqual(profileFacts(saved),[]);assert.deepEqual(publicProfileHighlights(saved),[]);
  assert.ok(profilePublicationIssues(saved,context().assets,'소재지').some(i=>i.code==='profile_review_required'));
  assert.ok(publicationIssues({showroom_status:'in_review',draft_content:{title:'공장',subtitle:'검토',summary:'내용',address:'소재지',propertyProfile:saved}},context().assets,[]).some(i=>i.code==='profile_review_required'));
  const legacy=publicDto({schema_version:'1.0',title:'기존',subtitle:'기존 승인본',facts:[{key:'power',value:0}]});assert.equal(legacy?.facts[0].value,0);
});

function harness(){
  let room:any={id:'room',property_id:property,slug:'factory-test',showroom_status:'published',revision:4,published_revision:4,approved_by:property,approved_at:'2026-11-01',published_at:'2026-11-01',draft_content:{schema_version:'1.0',id:property,category:'industrial',title:'기존',subtitle:'기존 제목',summary:'기존 요약',facts:[],concepts:[],assets:[],unknowns:[]},published_content:{schema_version:'1.0',id:property,title:'기존 승인본',subtitle:'기존 승인 제목',facts:[],concepts:[],assets:[]}};
  const writes:any[]=[];
  const fetcher=(async(url:unknown,init:RequestInit={})=>{
    const path=String(url);
    if(path.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
    if(path.includes('/property_assets?')){assert.match(path,new RegExp('property_id=eq.'+property));return Response.json(context().assets.map(a=>({...a,kind:'document'})));}
    if(path.includes('/property_image_jobs?'))return Response.json([]);
    if(path.includes('/property_showrooms?')){
      assert.ok(path.includes('property_id=eq.'+property)||path.includes('showroom_status=eq.published'));
      if(init.method==='PATCH'){
        const patch=JSON.parse(init.body as string);writes.push(patch);
        if(!path.includes('revision=eq.'+room.revision))return Response.json([]);
        room={...room,...patch};
      }
      return Response.json([room]);
    }
    throw Error('unexpected request '+path);
  }) as typeof fetch;
  return {handler:createHandler({url:'https://db',key:'test-server-key',fetcher}),publicHandler:createPublicHandler('https://db','test-server-key',fetcher),room:()=>structuredClone(room),writes};
}
const edits=(p:any)=>({title:'공장',subtitle:'새 헤드라인',summary:'제공자료 검토',concepts:[],address:'확인할 소재지',propertyProfile:p});

test('save -> review -> publish -> public projection; later draft edits preserve approved snapshot',async()=>{
  const h=harness();const prior=h.room().published_content;
  let r=await h.handler(request('save-draft',{revision:4,edits:edits(input())},'PATCH'));assert.equal(r.status,200);
  assert.deepEqual(h.room().published_content,prior);assert.equal(h.writes[0].published_content,undefined);
  assert.equal((await h.handler(request('save-draft',{revision:4,edits:edits(input())},'PATCH'))).status,409);
  r=await h.handler(request('request-review',{revision:5}));assert.equal(r.status,200);
  r=await h.handler(request('publish',{revision:6,review:{facts:true,rights:true,claims:true,privacy:true,notes:'출처와 자료의 공개 범위를 확인했습니다.'}}));assert.equal(r.status,200);
  const published=h.room().published_content;
  const publicResponse=await h.publicHandler(new Request('https://x.test?slug=factory-test'));assert.equal(publicResponse.status,200);
  const payload=await publicResponse.json();assert.equal(payload.showroom.facts[0].value,100);assert.equal(payload.showroom.facts[0].unit,'㎡');assert.doesNotMatch(JSON.stringify(payload),/sourceIds|sourcePermissions|_review/);
  const changed=input();changed.fields[0].value=200;
  r=await h.handler(request('save-draft',{revision:7,edits:edits(changed)},'PATCH'));assert.equal(r.status,200);
  assert.deepEqual(h.room().published_content,published);
  assert.equal((await(await h.publicHandler(new Request('https://x.test?slug=factory-test'))).json()).showroom.facts[0].value,100);
});
test('save rejects foreign evidence and publish rechecks disclosure even without browser preflight',async()=>{
  const h=harness();const foreign=input();foreign.fields[0].sourceIds=[other];
  assert.equal((await h.handler(request('save-draft',{revision:4,edits:edits(foreign)},'PATCH'))).status,400);assert.equal(h.writes.length,0);
  const blocked=input();blocked.sourcePermissions[0].allowDerivedPublication=false;
  assert.equal((await h.handler(request('save-draft',{revision:4,edits:edits(blocked)},'PATCH'))).status,200);
  assert.equal((await h.handler(request('request-review',{revision:5}))).status,200);
  const r=await h.handler(request('publish',{revision:6,review:{facts:true,rights:true,claims:true,privacy:true,notes:'자료 출처와 정보의 공개 범위를 확인했습니다.'}}));
  assert.equal(r.status,400);assert.equal((await r.json()).error,'profile_review_required');
  assert.equal(h.room().published_revision,4);
});

test('negotiable prices do not expose stale entered amounts and incomplete highlights stay hidden',()=>{
  const p:any=input();p.price.saleWon=999999999;p.highlights=[{id:'empty',title:'검토 중',description:'PRIVATE_UNFINISHED',constraints:'',fieldIds:[]}];
  const saved=validateProfile(p,context());assert.equal(profileSummary(saved).price.saleWon,null);assert.deepEqual(publicProfileHighlights(saved),[]);
  saved.price.status='fixed';assert.equal(profileSummary(saved).price.saleWon,999999999);
});

test('server blocks incomplete approved rental assumptions, publishes complete inputs and isolates later edits',async()=>{
  const h=harness(),p:any=input(),s=emptyRentalScenario();
  s.publication='approved';p.modules={rentalScenario:s};
  assert.equal((await h.handler(request('save-draft',{revision:4,edits:edits(p)},'PATCH'))).status,200);
  assert.equal((await h.handler(request('request-review',{revision:5}))).status,200);
  const review={facts:true,rights:true,claims:true,privacy:true,notes:'입력자료와 가정값, 공개 범위를 확인했습니다.'};
  const blocked=await h.handler(request('publish',{revision:6,review}));assert.equal(blocked.status,400);
  assert.equal((await blocked.json()).error,'profile_review_required');
  assert.ok(profilePublicationIssues(h.room().draft_content.propertyProfile,context().assets,'소재지').some(i=>i.target==='rental-scenario-editor'));
  s.purchasePrice.value=1000000000;s.annualRent.value=60000000;s.operatingCosts.value=12000000;s.vacancyBps.value=1000;
  assert.equal((await h.handler(request('save-draft',{revision:6,edits:edits(p)},'PATCH'))).status,200);
  assert.equal((await h.handler(request('request-review',{revision:7}))).status,200);
  assert.equal((await h.handler(request('publish',{revision:8,review}))).status,200);
  const payload=await(await h.publicHandler(new Request('https://x.test?slug=factory-test'))).json();
  assert.equal(payload.showroom.rentalScenario.annualRent.value,60000000);
  s.annualRent.value=99999999;s.publication='private';
  assert.equal((await h.handler(request('save-draft',{revision:9,edits:edits(p)},'PATCH'))).status,200);
  const stillPublic=await(await h.publicHandler(new Request('https://x.test?slug=factory-test'))).json();
  assert.equal(stillPublic.showroom.rentalScenario.annualRent.value,60000000);
});
