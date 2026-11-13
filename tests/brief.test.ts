import {test} from 'node:test';
import assert from 'node:assert/strict';
import {briefFromStrategy,briefInstruction,targetOptions,validateBrief} from '../supabase/functions/_shared/brief.ts';

const strategy={positioning:'역세권 소형 상가',buyerSegments:[{label:'카페 창업자',rationale:'유동 인구',sourceRefs:[]},{label:'학원 운영자',rationale:'학교 인접',sourceRefs:[]}],
  sellingPoints:[{fact:'테라스 20평',buyerBenefit:'야외 좌석 운영',sourceRefs:[{kind:'input_text',excerpt:'테라스 20평'}]},{fact:'역 도보 3분',buyerBenefit:'방문 편리',sourceRefs:[{kind:'input_text'}]},{fact:'코너 자리',buyerBenefit:'가시성',sourceRefs:[{kind:'pdf',excerpt:'코너'}]},{fact:'네 번째',buyerBenefit:'x',sourceRefs:[]}],
  materialConstraints:[{description:'권리금 조건 미확인',relatedClaim:'x'}]};

test('the default brief comes from the analysis without inventing anything',()=>{
  const b=briefFromStrategy(strategy);
  assert.equal(b.target,'카페 창업자');assert.equal(b.tone,'professional');
  assert.deepEqual(b.points.map(p=>p.fact),['테라스 20평','역 도보 3분','코너 자리']);
  assert.equal(b.points[0].source,'테라스 20평');assert.equal(b.points[1].source,'등록자 제공자료');
  assert.equal(b.avoid,'권리금 조건 미확인');
  assert.deepEqual(briefFromStrategy(undefined),{version:1,target:'',tone:'professional',points:[],avoid:''});
  assert.deepEqual(targetOptions(strategy).map(t=>t.label),['카페 창업자','학원 운영자']);
});

test('validation keeps only the expected shape and limits',()=>{
  const b=briefFromStrategy(strategy);
  assert.deepEqual(validateBrief({...b,extra:'x'}),b);
  assert.throws(()=>validateBrief({...b,tone:'loud'}));
  assert.throws(()=>validateBrief({...b,points:[...b.points,b.points[0]]}));
  assert.throws(()=>validateBrief({...b,points:[{fact:'',buyerBenefit:'',source:''}]}));
  assert.throws(()=>validateBrief({...b,target:'가'.repeat(101)}));
});

test('the rewrite instruction lists target, ordered points, tone and cautions within 1,000 characters',()=>{
  const text=briefInstruction(briefFromStrategy(strategy));
  assert.match(text,/타깃 고객: 카페 창업자/);
  assert.match(text,/1\) 테라스 20평 → 야외 좌석 운영 2\) 역 도보 3분/);
  assert.match(text,/글 톤: 전문적이고 신뢰감 있게/);
  assert.match(text,/주의·피할 표현: 권리금 조건 미확인/);
  assert.match(text,/숫자·인허가·수익을 새로 만들지 마세요/);
  const long=briefInstruction({version:1,target:'가'.repeat(100),tone:'premium',avoid:'나'.repeat(500),points:[0,1,2].map(()=>({fact:'다'.repeat(300),buyerBenefit:'라'.repeat(300),source:''}))});
  assert.ok(long.length<=1000);
});
