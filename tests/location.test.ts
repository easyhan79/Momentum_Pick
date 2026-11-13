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
test('building lines and section problems read plainly',async()=>{
 const {buildingLines,sectionProblem}=await import('../showroom-web/src/lib/location.ts');
 const lines=buildingLines({name:'시험빌딩',dong:'',mainUse:'업무시설',otherUse:'',structure:'철근콘크리트구조',floorsAbove:12,floorsBelow:4,approvedOn:'2005-03-17',landArea:null,buildingArea:820,totalArea:3305.785,coverageRatio:53.9,floorAreaRatio:null,parking:84,elevators:4});
 assert.deepEqual(lines,['주용도 업무시설','지상 12층 · 지하 4층','사용승인 2005-03-17','연면적 3,305.785㎡ (1,000평)','철근콘크리트구조','주차 84대 · 승강기 4대','건폐율 53.9% · 용적률 -%']);
 assert.match(sectionProblem({status:'unavailable',error:'public_unauthorized'}),/활용신청/);
 assert.equal(sectionProblem({status:'done'}),'');
});
