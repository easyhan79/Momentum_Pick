import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queuePlan,dispatchPlan} from '../functions/_shared/plan-queue.ts';
import {createPublicHandler} from '../functions/public-showroom/index.ts';
const id='5f0c0bc1-9dc7-496c-8511-0e9ecc066f17',asset='3408c9f7-3e76-466a-b5a3-8b020c3043df';
test('plan request preserves edits and published snapshot, checks revision and scopes media',async()=>{
 const calls:any[]=[];
 const db=async(path:string,init?:RequestInit)=>{calls.push([path,init]);if(path.startsWith('property_assets')){assert.match(path,new RegExp(`property_id=eq.${id}`));assert.match(path,/source_type=neq.ai_generated&kind=neq.concept/);return[{id:asset}];}if(!init)return[{revision:6,draft_content:{title:'edited',concepts:[]}}];const patch=JSON.parse(init.body as string);assert.deepEqual(Object.keys(patch).sort(),['draft_content','revision']);assert.match(path,/revision=eq.6/);assert.equal(patch.draft_content.title,'edited');assert.equal(patch.draft_content.planAnalysis.state,'queued');return[{revision:7,draft_content:patch.draft_content}];};
 assert.equal((await queuePlan(db,id,asset,6)).revision,7);
 await assert.rejects(queuePlan(db,id,asset,5),/revision_conflict/);
 await assert.rejects(queuePlan(async()=>[],id,asset,6),/asset_missing/);
});
test('active analysis cannot be duplicated',async()=>{
 const db=async(path:string)=>path.startsWith('property_assets')?[{id:asset}]:[{revision:1,draft_content:{planAnalysis:{state:'running',startedAt:new Date().toISOString()}}}];
 await assert.rejects(queuePlan(db,id,asset),/already_running/);
});
test('dispatch reports accepted versus scheduled recovery without exposing token',async()=>{
 assert.equal(await dispatchPlan([],async()=>{throw Error('must not run');}),false);
 assert.equal(await dispatchPlan(['secret'],(async(url,init)=>{assert.match(String(url),/workflows\/agent.yml\/dispatches$/);assert.deepEqual(JSON.parse(init!.body as string),{ref:'main'});return new Response(null,{status:204});}) as typeof fetch),true);
 assert.equal(await dispatchPlan(['secret'],(async()=>new Response(null,{status:403})) as typeof fetch),false);
});
test('public plan proxy only serves a plan in the approved snapshot',async()=>{
 let storageCalls=0;
 const snapshot={id,schema_version:'1.0',title:'매물',subtitle:'제목',concepts:[{id:'c',plan:{assetId:asset,caption:'도면'},zones:[{id:'z',label:'입구',position:{x:20,y:30}}]}]};
 const handler=createPublicHandler('https://db.test','SECRET',(async(url)=>{const path=String(url);if(path.includes('property_showrooms'))return Response.json([{approved_by:'admin',approved_at:'now',published_at:'now',published_revision:6,published_content:snapshot}]);if(path.includes('property_assets')){assert.match(path,new RegExp(`property_id=eq.${id}`));return Response.json([{storage_path:`${id}/${asset}.png`}]);}storageCalls++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});}) as typeof fetch);
 const dto=await (await handler(new Request('https://x.test?slug=test-property'))).json();assert.equal(dto.showroom.concepts[0].zones[0].position.x,20);
 assert.equal((await handler(new Request(`https://x.test?slug=test-property&plan=${asset}`))).status,200);
 assert.equal((await handler(new Request(`https://x.test?slug=test-property&plan=${id}`))).status,404);assert.equal(storageCalls,1);
});
