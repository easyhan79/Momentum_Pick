import {test} from 'node:test';import assert from 'node:assert/strict';
import {distanceText,locationStatus,type LocationRow} from '../showroom-web/src/lib/location.ts';

const row=(state:LocationRow['state'],extra:Partial<LocationRow>={}):LocationRow=>({address:'서울 강남구 테헤란로 152',state,report:{},error_code:'',fetched_at:'',updated_at:'',...extra});
test('location status tells the administrator what to do next',()=>{
 assert.match(locationStatus(false,null,'주소'),/준비되지 않았습니다/);
 assert.match(locationStatus(true,null,' '),/소재지를 입력하고 저장/);
 assert.match(locationStatus(true,null,'서울 강남구 테헤란로 152'),/조사하는 중/);
 assert.match(locationStatus(true,row('done'),'경기 여주시 1'),/조사하는 중/,'a report for an older address is stale');
 assert.equal(locationStatus(true,row('done'),'서울 강남구 테헤란로 152'),'');
 assert.match(locationStatus(true,row('not_found'),'서울 강남구 테헤란로 152'),/찾지 못했습니다/);
 assert.match(locationStatus(true,row('failed',{error_code:'kakao_unauthorized'}),'서울 강남구 테헤란로 152'),/카카오맵/);
 assert.match(locationStatus(true,row('failed',{error_code:'kakao_500',report:{nearby:[]}}),'서울 강남구 테헤란로 152'),/다시 시도합니다\. 아래는 이전 조사 결과/);
});
test('distances read naturally',()=>{assert.equal(distanceText(120),'120m');assert.equal(distanceText(1500),'1.5km');});
