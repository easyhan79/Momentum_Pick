import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fact } from '../showroom-web/src/types/showroom.ts';
import { hasFactValue, industrialReview } from '../showroom-web/src/lib/industrialReview.ts';

test('missing values remain unknown while zero is a supplied value', () => {
  for (const value of [null, undefined, '', '  ', NaN, Infinity]) assert.equal(hasFactValue(value), false);
  for (const value of [0, 500, '협의', '0']) assert.equal(hasFactValue(value), true);
  const groups=industrialReview([]);
  assert.ok(groups.flatMap(group=>group.rows).every(row=>row.missing&&row.entries.length===0));
});

test('industrial review preserves provenance and competing source entries without inventing conditions', () => {
  const facts:Fact[]=[
    {key:'power',label:'전력',value:500,unit:'kW',evidence:'owner_provided',source:'소유자 제공자료'},
    {key:'power_capacity',label:'전력',value:300,unit:'kW',evidence:'needs_review',source:'과거 제공자료'},
    {key:'road',label:'접도',value:'확인 전',evidence:'ai_hypothesis',source:'AI 검토 메모'},
    {key:'rent',label:'임대료',value:900,evidence:'owner_provided',source:'제공자료'},
  ];
  const before=JSON.stringify(facts);
  const groups=industrialReview(facts);
  const power=groups.find(g=>g.id==='facilities')!.rows[0];
  assert.deepEqual(power.entries,facts.slice(0,2));
  assert.equal(power.missing,false);
  assert.equal(groups.find(g=>g.id==='access')!.rows[0].entries[0].evidence,'ai_hypothesis');
  assert.ok(groups.find(g=>g.id==='facilities')!.rows.find(row=>row.label==='층고')?.missing);
  assert.equal(groups.flatMap(group=>group.rows.flatMap(row=>row.entries)).some(fact=>fact.key==='rent'),false);
  assert.equal(JSON.stringify(facts),before);
});
