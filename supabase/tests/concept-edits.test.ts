import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateConceptEdits,changedConceptSlots} from '../functions/_shared/concept-edits.ts';
const concept=(id='concept-1')=>({id,conceptName:'제조 검토',headline:'가설',rationale:'시설 확인 필요',feasibility:'not_checked',zones:[{id:'zone-1',label:'작업 구역',title:'검토',body:''}]});
test('add/delete/reorder preserve stable slots and only semantic edits invalidate images',async()=>{
 const first=concept(),second=concept('concept-2');
 const reordered=await validateConceptEdits([second,first],[first,second],async()=>undefined);
 assert.deepEqual(reordered.map(c=>c.id),['concept-2','concept-1']);assert.deepEqual(changedConceptSlots([first,second],reordered),[]);
 assert.deepEqual(changedConceptSlots([first],[{...first,conceptName:'다른 활용'}]),['concept-1']);
 assert.deepEqual(changedConceptSlots([first],[second]),['concept-1','concept-2']);
 assert.deepEqual(changedConceptSlots([first],[{...first,zones:[{...first.zones[0],position:{x:20,y:30}}]}]),[]);
});
test('concepts bound content and positions and cannot forge plan URLs or verified claims',async()=>{
 for(const input of [[concept(),concept()],Array.from({length:4},(_,i)=>concept('concept-'+(i+1))),[{...concept(),id:'arbitrary-new'}],[{...concept(),zones:[{...concept().zones[0],position:{x:101,y:20}}]}]])await assert.rejects(validateConceptEdits(input,[],async()=>undefined));
 const source='20000000-0000-4000-8000-000000000002';
 const output=await validateConceptEdits([{...concept(),plan:{assetId:source,url:'https://untrusted'},zones:[{...concept().zones[0],evidence:'verified'}]}],[],async id=>({id,caption:'실제 제공 도면'}));
 assert.equal(output[0].plan.url,undefined);assert.equal(output[0].zones[0].evidence,'ai_hypothesis');assert.equal(output[0].feasibility,'not_checked');
 await assert.rejects(validateConceptEdits([{...concept(),plan:{assetId:source}}],[],async()=>undefined));
});

test('purpose links are kind-scoped, server-derived and invalidate only affected image slots',async()=>{
 const c={...concept(),purposeIds:['factory-research','factory-manufacturing'],purposeContext:[{secret:'CLIENT'}]};
 const next=await validateConceptEdits([c],[concept()],async()=>undefined,'factory');
 assert.deepEqual(next[0].purposeIds,['factory-manufacturing','factory-research']);assert.doesNotMatch(JSON.stringify(next),/CLIENT/);
 assert.ok(next[0].purposeContext[0].requiredKeys.length);assert.deepEqual(changedConceptSlots([concept()],next),['concept-1']);
 assert.deepEqual(changedConceptSlots([c],[{...c,purposeIds:[...c.purposeIds].reverse()}]),[]);
 await assert.rejects(validateConceptEdits([{...concept(),purposeIds:['land-commercial']}],[],async()=>undefined,'factory'));
});
