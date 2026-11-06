import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateProfile,visibleField} from '../functions/_shared/property-profile.ts';
import {defaultDecisionSettings,decisionCards,publicDecision} from '../functions/_shared/customer-decision.ts';
import {publicDto} from '../functions/_shared/public-showroom-dto.ts';
const context={assets:[],userId:'server-admin',now:'2026-11-07T00:00:00Z'};
const f=(key:string,value:any,patch:any={})=>({id:key,key,label:key,value,unit:'',status:'provided',sourceText:'공개 제공자료',sourceIds:[],useApproved:true,publication:'approved',asOf:'2026-11-01',...patch});
function profile(kind:any,fields:any[]){return validateProfile({version:1,kind,transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields,sourcePermissions:[],highlights:[],modules:{customerDecision:{...defaultDecisionSettings(kind),publication:'approved',reviewConfirmed:true}}},context);}
const report=(p:any)=>publicDecision(p,p.fields.filter((f:any)=>visibleField(f,p)))!;
const snapshot=(p:any)=>({schema_version:'1.0',id:'synthetic',title:'합성',subtitle:'검토',category:p.kind,propertyProfile:p,customerDecision:report(p)});
function reverseKeys(v:any):any{return Array.isArray(v)?v.map(reverseKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reverseKeys(v[k])])):v;}
test('all five kinds create consistent missing/claim/interpretation cards with purpose-specific material requests',()=>{
 for(const kind of ['factory','logistics','commercial','land','income']){
  const p=profile(kind,[]),cards=report(p).cards;
  assert.ok(cards.length);assert.ok(cards.every(c=>c.status==='unknown'&&c.conditionState==='unknown'&&c.analysisStatus==='inferred'&&c.materials?.length));
  assert.doesNotMatch(cards.map(c=>c.conclusion).join(' '),/확정 수익|예상 매출 [0-9]|적합합니다|허가 가능합니다/);
  const keys={factory:'power_capacity',logistics:'temperature_type',commercial:'building_use',land:'road_access',income:'lease_period'};
  const key=keys[kind as keyof typeof keys],provided=profile(kind,[f(key,'제공 조건 A')]);
  const supplied=report(provided).cards.find(c=>c.slotKey===key)!;assert.equal(supplied.status,'provided');assert.equal(supplied.analysisStatus,'inferred');
  const conflict=profile(kind,[f(key,'제공 조건 A'),f(key,'제공 조건 B',{id:'second-source'})]);assert.equal(report(conflict).cards.find(c=>c.slotKey===key)!.status,'inferred');
  const privateInput=profile(kind,[f(key,'PRIVATE_KIND_VALUE',{publication:'private'})]);assert.doesNotMatch(JSON.stringify(publicDto(snapshot(privateInput))),/PRIVATE_KIND_VALUE/);

 }
 assert.match(report(profile('income',[])).cards.find(c=>c.slotKey==='annual_rent')!.interpretation,/확정 수익률이 아닙니다/);
 const factory=JSON.stringify(report(profile('factory',[])));assert.doesNotMatch(factory,/배후 주거|카페|학원/);
});
test('zero is preserved as a supplied condition, not missing or adequate power',()=>{
 const p=profile('factory',[f('power_capacity',0,{unit:'kW'})]);const card=report(p).cards.find(c=>c.slotKey==='power_capacity')!;
 assert.equal(card.references[0].value,0);assert.equal(card.status,'provided');assert.equal(card.conditionState,'review');assert.match(card.conclusion,/0 또는 음수/);assert.match(card.interpretation,/설비 부하/);assert.doesNotMatch(card.conclusion,/충분|적합합니다/);
});
test('building leases preserve only supplied entries without invented floors, vacancy or sums',()=>{
 const p=profile('income',[f('rent_roll','1층 임대 중',{label:'1층 공개 임대현황'}),f('rent_roll','3층 조건 확인 중',{id:'floor-three',label:'3층 공개 임대현황'}),f('rent_roll','PRIVATE_CONTRACT',{id:'private-contract',publication:'private'})]);
 const card=report(p).cards.find(c=>c.slotKey==='rent_roll')!;assert.equal(card.references.length,2);assert.match(card.conclusion,/2건/);assert.doesNotMatch(card.conclusion,/서로 다른|2층|합계 [0-9]|공실률/);
 assert.doesNotMatch(JSON.stringify(publicDto(snapshot(p))),/PRIVATE_CONTRACT|private-contract/);
});
test('land rules never turn legal ratios into actual developable floor area or permits',()=>{
 const p=profile('land',[f('land_use_zone','제공 용도지역'),f('building_coverage_ratio',60,{unit:'%'}),f('land_area',1000,{unit:'㎡'})]);const cards=report(p).cards;
 assert.match(cards.find(c=>c.slotKey==='land_use_zone')!.interpretation,/실제 증축 가능 면적을 확정하지 않습니다/);
 assert.doesNotMatch(JSON.stringify(cards),/600㎡|개발 가능 면적 600|허가 가능합니다/);
});
test('approved prose is frozen, while unapproved/missing frozen reports are never exposed',()=>{
 const p=profile('factory',[f('power_capacity',100)]),room=snapshot(p);room.customerDecision.cards[0].conclusion='승인 시 검토한 문장을 유지합니다.';
 const dto=publicDto(room)!;assert.equal(dto.customerDecision!.cards[0].conclusion,'승인 시 검토한 문장을 유지합니다.');
 const draft=structuredClone(room);draft.propertyProfile.fields[0].value=200;assert.equal(publicDto(room)!.customerDecision!.cards[0].references[0].value,100);
 assert.equal(publicDto({...room,customerDecision:undefined})!.customerDecision,undefined);
 const poisoned=structuredClone(room);poisoned.customerDecision.cards[0].references[0].value='FOREIGN_PRIVATE_VALUE';assert.doesNotMatch(JSON.stringify(publicDto(poisoned)),/FOREIGN_PRIVATE_VALUE/);
});
test('JSONB object key order cannot invalidate review or hide matching references',()=>{
 const p=profile('factory',[f('power_capacity',100)]),database=reverseKeys(p);
 const next=validateProfile(database,{...context,previous:database});assert.equal(next.modules!.customerDecision!.reviewedBy,context.userId);
 const shuffled=reverseKeys(snapshot(p));assert.ok(publicDto(shuffled)!.customerDecision!.cards.find(c=>c.references.length));
});

test('real admin save/publish freezes reviewed analysis and later edits cannot replace the public report',async()=>{
 const {createHandler}=await import('../functions/showroom-admin/index.ts');
 const id='10000000-0000-4000-8000-000000000001';
 let room:any={property_id:id,slug:'synthetic-analysis',showroom_status:'in_review',revision:1,draft_content:{schema_version:'1.0',id,category:'industrial',title:'합성',subtitle:'검토',summary:'제공자료로 검토합니다.',address:'합성 소재지',propertyProfile:profile('factory',[f('power_capacity',100),f('land_area',100,{unit:'㎡'})]),concepts:[],assets:[],unknowns:[]}};
 const handler=createHandler({url:'https://synthetic.invalid',key:'synthetic',fetcher:(async(url,init:any={})=>{const path=String(url);if(path.endsWith('/auth/v1/user'))return Response.json({id,app_metadata:{showroom_admin:true}});if(path.includes('/property_assets?')||path.includes('/property_image_jobs?'))return Response.json([]);if(path.includes('/property_showrooms?')){if(init.method==='PATCH')room={...room,...JSON.parse(init.body)};return Response.json([room]);}throw Error('unexpected request');}) as typeof fetch});
 const call=(action:string,edits:any={})=>handler(new Request('https://x.test',{method:action==='save-draft'?'PATCH':'POST',headers:{Authorization:'Bearer synthetic-admin'},body:JSON.stringify({action,propertyId:id,revision:room.revision,...edits})}));
 assert.equal((await call('publish',{review:{facts:true,rights:true,claims:true,privacy:true,notes:'합성 제공자료와 공개 조건을 대조했습니다.'}})).status,200);
 assert.equal(room.published_content.customerDecision.engineVersion,'provided-rules-v1');const before=structuredClone(room.published_content);
 const changed=structuredClone(room.draft_content);changed.propertyProfile.fields[0].value=200;
 assert.equal((await call('save-draft',{edits:changed})).status,200);assert.deepEqual(room.published_content,before);
 assert.equal(room.draft_content.propertyProfile.modules.customerDecision.reviewedBy,undefined);
 assert.equal(publicDto(room.published_content)!.customerDecision!.cards[0].references[0].value,100);
});
