import {scenarioInputLabels} from '../../../supabase/functions/_shared/rental-scenario.ts';
import type {RentalScenario,ScenarioKey} from '../../../supabase/functions/_shared/rental-scenario.ts';

export function RentalScenarioInputs({value,onChange,metadata=false,disabled=false}:{value:RentalScenario;onChange:(value:RentalScenario)=>void;metadata?:boolean;disabled?:boolean}){
  return <div className="rental-inputs">{(Object.keys(scenarioInputLabels) as ScenarioKey[]).map(key=>{
    const input=value[key],vacancy=key==='vacancyBps';
    return <fieldset key={key} disabled={disabled}><legend>{scenarioInputLabels[key]}</legend>
      <label>{vacancy?'공실률 · %':`${scenarioInputLabels[key]} · 원${key==='purchasePrice'?'':'/년'}`}<input aria-label={`${scenarioInputLabels[key]} 입력`} type="number" min="0" max={vacancy?100:1000000000000000} step={vacancy?'0.01':'1'} value={input.value===null?'':vacancy?input.value/100:input.value} onChange={e=>{
        const raw=e.target.value,n=raw===''?null:Number(raw),next=n===null?null:vacancy?Math.round(n*100):n;
        onChange({...value,[key]:{...input,value:next,...(!metadata?{basis:'assumption',sourceText:''}:{})}});
      }}/></label>
      {metadata&&<><label>입력 근거<select aria-label={`${scenarioInputLabels[key]} 근거`} value={input.basis} onChange={e=>onChange({...value,[key]:{...input,basis:e.target.value}})}><option value="assumption">사용자 가정</option><option value="provided">제공자료 · 미검증</option></select></label>
        <label>공개할 출처 또는 가정 설명 · 개인정보 제외<input aria-label={`${scenarioInputLabels[key]} 출처`} maxLength={500} value={input.sourceText} onChange={e=>onChange({...value,[key]:{...input,sourceText:e.target.value}})}/></label></>}
    </fieldset>;
  })}</div>;
}
