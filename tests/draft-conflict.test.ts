import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reapplyEdits} from '../showroom-web/src/lib/draftConflict.ts';
import type {Showroom} from '../showroom-web/src/types/showroom.ts';

const room=(v:Record<string,unknown>)=>v as unknown as Showroom;

test('re-applies only the fields the admin changed and keeps newer background changes',()=>{
  const base=room({title:'매물',summary:'요약',concepts:[{id:'a'}],propertyProfile:{fields:[{id:'area',value:50}]},heroAsset:{id:'old'}});
  const mine=room({title:'매물',summary:'고친 요약',concepts:[{id:'a'}],propertyProfile:{fields:[{id:'area',value:55}]},heroAsset:{id:'old'}});
  const latest=room({title:'자동 준비 제목',summary:'요약',concepts:[{id:'a'},{id:'b'}],propertyProfile:{fields:[{id:'area',value:50}]},heroAsset:{id:'new'}});
  const merged=reapplyEdits(base,mine,latest) as unknown as Record<string,unknown>;
  assert.equal(merged.summary,'고친 요약');
  assert.deepEqual(merged.propertyProfile,{fields:[{id:'area',value:55}]});
  assert.equal(merged.title,'자동 준비 제목');
  assert.deepEqual(merged.concepts,[{id:'a'},{id:'b'}]);
  assert.deepEqual(merged.heroAsset,{id:'new'});
});

test('without unsaved changes the latest draft is returned unchanged',()=>{
  const base=room({title:'A',summary:'B'}),latest=room({title:'C',summary:'D',subtitle:'E'});
  assert.deepEqual(reapplyEdits(base,base,latest),latest);
});

test('fields that were added or removed by the admin are carried over',()=>{
  const base=room({title:'A'}),mine=room({title:'A',imageSettings:{mode:'photo'}}),latest=room({title:'A',address:'서울'});
  assert.deepEqual(reapplyEdits(base,mine,latest),{title:'A',address:'서울',imageSettings:{mode:'photo'}});
});
