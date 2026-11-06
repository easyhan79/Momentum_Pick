import {test} from 'node:test';import assert from 'node:assert/strict';
import {naturalCustomerCopy,customerCopyReview} from '../functions/_shared/customer-copy.ts';
import {toDraft} from '../functions/showroom-admin/index.ts';
import {publicDto} from '../functions/public-showroom/index.ts';

test('legacy labels become source-aware prose while numbers and contract conditions survive',()=>{
 const source='[사실 조건] 토지 100㎡입니다. [제공 주장] 8년 임차계약이라고 합니다. [활용 가설] 승계 가능 여부는 확인이 필요합니다.';
 const result=naturalCustomerCopy(source);
 assert.equal(result,'제공자료에 따르면 토지 100㎡입니다. 제공자 설명에 따르면 8년 임차계약이라고 합니다. 활용 방향은 검토 단계입니다. 승계 가능 여부는 확인이 필요합니다.');
 assert.equal(naturalCustomerCopy(result),result);
 assert.deepEqual(customerCopyReview({usp_summary:source}).map(item=>item.category),['provided_information','provided_claim','usage_hypothesis']);
});
test('card markers, unknown labels and zero are unchanged',()=>{
 assert.equal(naturalCustomerCopy('[카드 1]\n[제공주장] 임대료 0원 [자료 확인]'), '[카드 1]\n제공자 설명에 따르면 임대료 0원 [자료 확인]');
 assert.equal(naturalCustomerCopy('장기 임대 중입니다.'),'장기 임대 중입니다.');
});
test('private review exposes only bounded supported metadata and rejects verified categories',()=>{
 const items=customerCopyReview({raw_input:'PRIVATE',copy_review:[{category:'verified',statement:'wrong'},{category:'provided_claim',statement:'조건'.repeat(1000),check:'계약서 대조',secret:'PRIVATE'}]});
 assert.equal(items.length,1);assert.equal(items[0].statement.length,1000);assert.doesNotMatch(JSON.stringify(items),/PRIVATE|verified/);
});
test('new drafts and public DTO exclude original AI review; published prose is preserved exactly',()=>{
 const ai={usp_summary:'[제공 주장] 합성 임대 중입니다.',landing_copy:'합성 제목',_copy_original:{usp_summary:'[제공 주장] PRIVATE'},copy_review:[{category:'provided_claim',statement:'PRIVATE',check:'PRIVATE'}]};
 const draft=toDraft({id:'synthetic',ai_contents:ai});
 assert.equal(draft.summary,'제공자 설명에 따르면 합성 임대 중입니다.');assert.doesNotMatch(JSON.stringify(draft),/PRIVATE/);
 const dto=publicDto({...draft,copy_review:ai.copy_review,_copy_original:ai._copy_original,summary:'[제공 주장] 관리자가 승인한 원문 그대로'});
 assert.equal(dto?.summary,'[제공 주장] 관리자가 승인한 원문 그대로');assert.doesNotMatch(JSON.stringify(dto),/PRIVATE/);
});
test('legacy review recovers original classification even after customer formatting',()=>{
 const items=customerCopyReview({usp_summary:'제공자 설명에 따르면 임대 중입니다.',_copy_original:{usp_summary:'[제공 주장] 임대 중입니다.'}});
 assert.equal(items[0].category,'provided_claim');assert.equal(items[0].statement,'임대 중입니다.');
});
