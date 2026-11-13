import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageSlots,workflowStages} from '../showroom-web/src/lib/workflow.ts';

const room=(content:Record<string,unknown>,extra:Record<string,unknown>={})=>({revision:5,showroom_status:'draft',draft_content:{concepts:[{id:'concept-1'},{id:'concept-2'}],...content},...extra}) as any;
const states=(s:ReturnType<typeof workflowStages>)=>Object.fromEntries(s.map(x=>[x.key,x.state]));

test('a new listing asks for analysis first',()=>{
  assert.deepEqual(states(workflowStages(room({}),[],[])),{analysis:'todo',brief:'todo',copy:'todo',images:'todo',marketing:'todo',publish:'todo'});
});

test('after analysis the brief needs a check, then rewrites move from running to review to done',()=>{
  const analysed=room({salesStrategy:{}});
  assert.equal(states(workflowStages(analysed,[],[])).brief,'review');
  const briefed=room({salesStrategy:{},brief:{updatedAt:'2026-11-13T01:00:00Z'}});
  const job=(state:string,createdAt='2026-11-13T02:00:00Z')=>({id:'j',state,createdAt,fields:[]});
  assert.equal(states(workflowStages(briefed,[job('queued')],[])).copy,'running');
  assert.equal(states(workflowStages(briefed,[job('done')],[])).copy,'review');
  assert.equal(states(workflowStages(briefed,[job('applied')],[])).copy,'done');
  assert.equal(states(workflowStages(briefed,[job('applied')],[])).marketing,'done');
  // A rewrite from before the brief does not count as following it.
  assert.equal(states(workflowStages(briefed,[job('applied','2026-11-12T00:00:00Z')],[])).copy,'todo');
});

test('images count the hero and each concept slot; publish tracks unpublished changes',()=>{
  const r=room({salesStrategy:{},brief:{}});
  assert.deepEqual(imageSlots(r),['hero','concept-1','concept-2']);
  const done=(slot:string)=>({id:slot,slot,state:'done',attempts:1,asset_id:'a'});
  const s=workflowStages(r,[],[done('hero')]);
  assert.equal(s.find(x=>x.key==='images')!.detail,'1/3장');
  assert.equal(states(workflowStages(r,[],[done('hero'),done('concept-1'),done('concept-2')])).images,'done');
  assert.equal(states(workflowStages(r,[],[{id:'x',slot:'hero',state:'running',attempts:1}])).images,'running');
  assert.equal(states(workflowStages(room({},{showroom_status:'published',published_revision:5}),[],[])).publish,'done');
  assert.equal(states(workflowStages(room({},{showroom_status:'published',published_revision:4}),[],[])).publish,'review');
});
