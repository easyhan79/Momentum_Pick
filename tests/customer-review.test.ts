import {test} from 'node:test';
import assert from 'node:assert/strict';
import {briefGroups,matchingFacts,customerQuestions,operationalFacts,composeInquiryMemo,inquiryRequestPrefix} from '../showroom-web/src/lib/customerReview.ts';
import type {Fact} from '../showroom-web/src/types/showroom.ts';
const fact=(key:string,value:Fact['value'],evidence:Fact['evidence']='owner_provided',label=key):Fact=>({key,label,value,evidence,source:'합성 제공자료'});
test('brief excludes hypothetical/unknown values but preserves zero, units and competing provided records',()=>{
 const facts=[fact('power',0),fact('power',350),fact('power',999,'ai_hypothesis'),fact('power',900,'needs_review'),fact('power',null)];
 assert.deepEqual(matchingFacts(facts,['power']).map(f=>f.value),[0,350]);
 assert.ok(briefGroups('commercial').some(g=>g.keys.includes('indoor_area')));
 assert.ok(briefGroups('logistics').some(g=>g.keys.includes('temperature_type')));
});
test('type-specific guidance explains required evidence and terrace rights are conditional',()=>{
 const commercial=customerQuestions('commercial',[]),land=customerQuestions('land',[]),logistics=customerQuestions('logistics',[]);
 assert.ok(land.some(q=>q.document.includes('通行')||q.document.includes('통행')));
 assert.ok(logistics.some(q=>q.why.includes('임대제안')));
 assert.ok(!commercial.some(q=>q.id==='terrace'));
 assert.ok(customerQuestions('commercial',[fact('terrace_area',20)]).some(q=>q.id==='terrace'));
 assert.ok(customerQuestions('industrial',[]).some(q=>q.document.includes('전력')));
 assert.ok([...commercial,...land,...logistics].every(q=>q.why&&q.document&&q.provided.length===0));
});
test('provided contract facts stay separate from proposal and inferred income for all property types',()=>{
 const facts=[fact('annual_rent',72000000),fact('annual_rent',90000000,'owner_provided','예상 임대료'),fact('annual_rent',99000000,'ai_hypothesis'),fact('proposed_annual_rent',12000000),fact('operating_cost',0),fact('lease_end',null)];
 const result=operationalFacts(facts);assert.deepEqual(result.current.map(f=>f.value),[72000000,0]);assert.deepEqual(result.proposals.map(f=>f.value),[90000000,12000000]);
 assert.deepEqual(operationalFacts([]),{current:[],proposals:[]});
});
test('explicit unknowns are deduplicated and retained as customer requests without inventing answers',()=>{
 const questions=customerQuestions('unknown',[],['통행 권리','통행 권리','   ']);
 assert.equal(questions.filter(q=>q.title==='통행 권리').length,1);assert.ok(questions.every(q=>!q.provided.length));
});
test('inquiry memo carries selected materials and typed memo together without exceeding fixed prefix bounds',()=>{
 assert.equal(composeInquiryMemo([],' 문의 내용 '),'문의 내용');
 const result=composeInquiryMemo(['도면','도면','계약조건'],'입주 가능일도 알려주세요.');
 assert.equal(result,'[확인·자료 요청]\n- 도면\n- 계약조건\n\n입주 가능일도 알려주세요.');
 assert.ok(inquiryRequestPrefix(Array.from({length:20},(_,i)=>`${i}${'x'.repeat(300)}`)).length<1500);
});
