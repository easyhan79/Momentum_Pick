// Mechanical what-if arithmetic only. No market estimates or valuation inputs.
export type ScenarioInput={value:number|null;basis:'provided'|'assumption';sourceText:string};
export type RentalScenario={enabled:boolean;publication:'private'|'approved';purchasePrice:ScenarioInput;annualRent:ScenarioInput;operatingCosts:ScenarioInput;vacancyBps:ScenarioInput;notes:string};
export const scenarioInputLabels={purchasePrice:'매입가',annualRent:'연간 임대료',operatingCosts:'연간 운영비',vacancyBps:'공실률 가정'};
export type ScenarioKey=keyof typeof scenarioInputLabels;
const keys=Object.keys(scenarioInputLabels) as ScenarioKey[];
export function emptyRentalScenario():RentalScenario{
 const input=():ScenarioInput=>({value:null,basis:'assumption',sourceText:''});
 return {enabled:true,publication:'private',purchasePrice:input(),annualRent:input(),operatingCosts:input(),vacancyBps:input(),notes:''};
}
export function validateRentalScenario(value:unknown):RentalScenario{
 const v=value as RentalScenario;
 if(!v||typeof v.enabled!=='boolean'||!['private','approved'].includes(v.publication)||typeof v.notes!=='string'||v.notes.length>1000)throw Error('invalid_rental_scenario');
 const input=(key:ScenarioKey):ScenarioInput=>{
  const x=v[key],max=key==='vacancyBps'?10000:1000000000000000;
  if(!x||!['provided','assumption'].includes(x.basis)||typeof x.sourceText!=='string'||x.sourceText.length>500||x.value!==null&&(!Number.isSafeInteger(x.value)||x.value<0||x.value>max))throw Error('invalid_rental_scenario');
  return {value:x.value,basis:x.basis,sourceText:x.sourceText.trim()};
 };
 return {enabled:v.enabled,publication:v.publication,purchasePrice:input('purchasePrice'),annualRent:input('annualRent'),operatingCosts:input('operatingCosts'),vacancyBps:input('vacancyBps'),notes:v.notes.trim()};
}
export function rentalScenarioIssues(scenario:RentalScenario){
 const issues:string[]=[];
 for(const key of keys){const input=scenario[key];if(input.value===null)issues.push(`${scenarioInputLabels[key]}을 입력해 주세요.`);if(input.basis==='provided'&&!input.sourceText)issues.push(`${scenarioInputLabels[key]}의 제공자료 출처를 입력해 주세요.`);}
 if(scenario.purchasePrice.value===0)issues.push('매입가는 0보다 커야 합니다.');
 return issues;
}
export function calculateRentalScenario(value:unknown){
 const scenario=validateRentalScenario(value);
 if(rentalScenarioIssues(scenario).length)return null;
 const rent=BigInt(scenario.annualRent.value!),cost=BigInt(scenario.operatingCosts.value!),price=BigInt(scenario.purchasePrice.value!),vacancy=BigInt(scenario.vacancyBps.value!);
 // Round a vacancy deduction to a won, then use exact integer arithmetic.
 const vacancyLoss=(rent*vacancy+5000n)/10000n;
 const collected=rent-vacancyLoss,operatingBalance=collected-cost;
 const numerator=operatingBalance*10000n;
 const bps=numerator<0n?-((-numerator+price/2n)/price):(numerator+price/2n)/price;
 const absolute=bps<0n?-bps:bps;
 const ratio=`${bps<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
 return {vacancyLossWon:Number(vacancyLoss),collectedRentWon:Number(collected),operatingBalanceWon:Number(operatingBalance),operatingRatioPercent:ratio};
}
export function publicRentalScenario(value:unknown):RentalScenario|undefined{
 try{const scenario=validateRentalScenario(value);return scenario.enabled&&scenario.publication==='approved'&&!rentalScenarioIssues(scenario).length?scenario:undefined;}catch{return undefined;}
}
