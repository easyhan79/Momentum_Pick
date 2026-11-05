import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateRentalScenario,emptyRentalScenario,publicRentalScenario,validateRentalScenario} from '../functions/_shared/rental-scenario.ts';
import {validateProfile,ProfileError} from '../functions/_shared/property-profile.ts';
import {publicDto} from '../functions/public-showroom/index.ts';

export function sampleScenario(){
  const scenario=emptyRentalScenario();
  scenario.purchasePrice.value=1000000000;scenario.annualRent.value=60000000;
  scenario.operatingCosts.value=12000000;scenario.vacancyBps.value=1000;
  return scenario;
}
test('annual inputs produce won-precise vacancy deduction, operating balance and ratio',()=>{
  assert.deepEqual(calculateRentalScenario(sampleScenario()),{vacancyLossWon:6000000,collectedRentWon:54000000,operatingBalanceWon:42000000,operatingRatioPercent:'4.20'});
});
test('unknown values and zero price never produce a number, while zero income/cost are valid',()=>{
  assert.equal(calculateRentalScenario(emptyRentalScenario()),null);
  const s=sampleScenario();s.purchasePrice.value=0;assert.equal(calculateRentalScenario(s),null);
  s.purchasePrice.value=1000000000;s.annualRent.value=0;s.operatingCosts.value=0;s.vacancyBps.value=0;
  assert.equal(calculateRentalScenario(s)?.operatingRatioPercent,'0.00');
  s.operatingCosts.value=null;assert.equal(calculateRentalScenario(s),null);
});
test('full vacancy and operating loss remain visible as negative balances',()=>{
  const s=sampleScenario();s.vacancyBps.value=10000;
  assert.deepEqual(calculateRentalScenario(s),{vacancyLossWon:60000000,collectedRentWon:0,operatingBalanceWon:-12000000,operatingRatioPercent:'-1.20'});
});
test('half-won deductions, negative rounding and large safe integers avoid floating point loss',()=>{
  const s=sampleScenario();s.purchasePrice.value=1000000000000000;s.annualRent.value=999999999999999;s.operatingCosts.value=0;s.vacancyBps.value=5000;
  assert.equal(calculateRentalScenario(s)?.vacancyLossWon,500000000000000);
  assert.equal(calculateRentalScenario(s)?.operatingBalanceWon,499999999999999);
  s.purchasePrice.value=20000;s.annualRent.value=0;s.operatingCosts.value=1;
  assert.equal(calculateRentalScenario(s)?.operatingRatioPercent,'-0.01');
});
test('invalid currency precision, range, fractions, source strings and input types are rejected',()=>{
  for(const invalid of [-1,0.1,Infinity,NaN,1000000000000001,'1000',undefined]){
    const s:any=sampleScenario();s.purchasePrice.value=invalid;assert.throws(()=>validateRentalScenario(s));
  }
  for(const invalid of [-1,10001,0.5]){const s=sampleScenario();s.vacancyBps.value=invalid;assert.throws(()=>validateRentalScenario(s));}
  const s:any=sampleScenario();s.annualRent.sourceText='x'.repeat(501);assert.throws(()=>validateRentalScenario(s));
  s.annualRent.sourceText='';s.annualRent.basis='verified';assert.throws(()=>validateRentalScenario(s));
});
test('public module needs separate approval, all inputs and a source for provided values',()=>{
  const s=sampleScenario();assert.equal(publicRentalScenario(s),undefined);
  s.publication='approved';s.annualRent.basis='provided';assert.equal(publicRentalScenario(s),undefined);
  s.annualRent.sourceText='  합성 임대자료 · 미검증  ';assert.equal(publicRentalScenario(s)?.annualRent.sourceText,'합성 임대자료 · 미검증');
  s.enabled=false;assert.equal(publicRentalScenario(s),undefined);s.enabled=true;
  s.operatingCosts.value=null;assert.equal(publicRentalScenario(s),undefined);
});
test('profile round trip and public whitelist retain only an approved scenario and recognized properties',()=>{
  const s:any=sampleScenario();s.privateMetadata='PRIVATE_EXTRA';s.purchasePrice.secret='PRIVATE_EXTRA';
  const p:any={version:1,kind:'commercial',transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[],sourcePermissions:[],highlights:[],modules:{rentalScenario:s,other:'PRIVATE_EXTRA'}};
  const saved=validateProfile(p,{assets:[],userId:'reviewer',now:'2026-11-06'});
  assert.deepEqual(saved.modules?.rentalScenario,sampleScenario());
  const draft={schema_version:'1.0',id:'sample',title:'합성 상가',subtitle:'예시',propertyProfile:saved,rentalScenario:{secret:'PRIVATE_EXTRA'}};
  assert.equal((publicDto(draft) as any).rentalScenario,undefined);
  saved.modules!.rentalScenario!.publication='approved';
  const dto=publicDto(draft) as any;assert.equal(dto.rentalScenario.annualRent.value,60000000);
  assert.doesNotMatch(JSON.stringify(dto),/PRIVATE_EXTRA|modules|propertyProfile/);
  p.modules.rentalScenario.purchasePrice.value=-1;
  assert.throws(()=>validateProfile(p,{assets:[],userId:'reviewer',now:'2026-11-06'}),ProfileError);
});
