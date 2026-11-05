import {test} from 'node:test';import assert from 'node:assert/strict';
import {propertyReview} from '../showroom-web/src/lib/propertyReview.ts';
import {propertyFieldTemplates} from '../showroom-web/src/lib/propertyFields.ts';
test('each property type exposes its own decision modules without inventing missing data',()=>{
 const commercial=propertyReview([],'commercial'),land=propertyReview([],'land'),logistics=propertyReview([],'logistics');
 assert.ok(commercial.some(g=>g.rows.some(r=>r.label==='테라스 사용권')));
 assert.ok(land.some(g=>g.rows.some(r=>r.label==='지목')));assert.ok(!land.some(g=>g.rows.some(r=>r.label==='공장등록')));
 assert.ok(logistics.some(g=>g.rows.some(r=>r.label==='접안 도크')));assert.ok(!logistics.some(g=>g.id==='logistics-lease'));
 assert.ok([...commercial,...land,...logistics].every(g=>g.rows.every(r=>r.missing&&r.entries.length===0)));
});
test('rental module is optional and supplied rent remains unverified revenue, not net yield',()=>{
 const groups=propertyReview([{key:'annual_rent',label:'연간 임대료',value:3494000000,unit:'원',evidence:'owner_provided',source:'합성 테스트 제공자료'}],'logistics');
 const rental=groups.find(g=>g.id==='logistics-lease')!;assert.match(rental.description,/순수익이 아닙니다/);assert.equal(rental.rows.find(r=>r.label==='연간 임대료')?.entries[0].evidence,'owner_provided');
 assert.ok(propertyFieldTemplates('commercial').some(([key])=>key==='exclusive_area'));assert.ok(propertyFieldTemplates('logistics').some(([key])=>key==='warehouse_area'));
 assert.deepEqual(propertyReview([],'unknown'),[]);
});
