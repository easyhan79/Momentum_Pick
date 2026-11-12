import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishCoreFacts,profilePublicationIssues,visibleField,type PropertyProfile} from '../supabase/functions/_shared/property-profile.ts';
import {registrationDraft} from '../supabase/functions/_shared/web-registration.ts';

const asset='20000000-0000-4000-8000-000000000002';
const base=(fields:PropertyProfile['fields'],permissions:PropertyProfile['sourcePermissions']=[]):PropertyProfile=>({version:1,kind:'commercial',transaction:'sale',price:{status:'fixed',saleWon:1_000_000_000,depositWon:null,monthlyWon:null},fields,sourcePermissions:permissions,highlights:[]});
const area=(patch:Partial<PropertyProfile['fields'][number]>={})=>({id:'area',key:'exclusive_area',label:'전용면적',value:165,unit:'㎡',status:'provided' as const,sourceText:'',sourceIds:[],useApproved:false,publication:'private' as const,...patch});
const reg=(rightsConfirmed:boolean,areaValue:number|null=165)=>registrationDraft({title:'매물',address:'서울',summary:'',kind:'commercial',transaction:'sale',price:{status:'fixed',saleWon:1,depositWon:null,monthlyWon:null},area:areaValue,rightsConfirmed,contact:{name:'담당',phone:'010-1234-5678',publicApproved:true}},'10000000-0000-4000-8000-000000000001');

test('a registration with confirmed rights publishes the entered area by default',()=>{
  const field=reg(true).propertyProfile.fields[0];
  assert.equal(field.publication,'approved');assert.equal(field.useApproved,true);
  assert.equal(visibleField(field,reg(true).propertyProfile),true);
  assert.deepEqual(profilePublicationIssues(reg(true).propertyProfile,[],'서울'),[]);
});

test('without confirmed rights or without an area value nothing is published',()=>{
  assert.equal(reg(false).propertyProfile.fields[0].publication,'private');
  assert.equal(reg(true,null).propertyProfile.fields[0].publication,'private');
});

test('a private entered area produces one actionable issue that publishCoreFacts resolves',()=>{
  const profile=base([area()]);
  assert.deepEqual(profilePublicationIssues(profile,[],'서울').map(i=>i.code),['core_facts_private']);
  const published=publishCoreFacts(profile);
  assert.equal(published.fields[0].sourceText,'등록자 제공정보');
  assert.deepEqual(profilePublicationIssues(published,[],'서울'),[]);
});

test('publishCoreFacts lets linked sources show the derived area but leaves other fields alone',()=>{
  const other={...area({id:'power',key:'power_capacity',label:'전력',unit:'kW',value:300})};
  const profile=base([area({sourceIds:[asset]}),other],[{assetId:asset,useApproved:false,allowDerivedPublication:false}]);
  const published=publishCoreFacts(profile);
  assert.deepEqual(published.sourcePermissions,[{assetId:asset,useApproved:true,allowDerivedPublication:true}]);
  assert.equal(visibleField(published.fields[0],published),true);
  assert.equal(published.fields[1].publication,'private');
});

test('without any entered area the issue asks for an area instead',()=>{
  assert.deepEqual(profilePublicationIssues(base([area({value:null,status:'unknown'})]),[],'서울').map(i=>i.message),['면적을 ㎡ 단위 숫자로 입력하고 저장해 주세요.']);
});
