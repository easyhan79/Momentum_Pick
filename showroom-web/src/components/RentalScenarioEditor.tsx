import {calculateRentalScenario,emptyRentalScenario,rentalScenarioIssues,validateRentalScenario} from '../../../supabase/functions/_shared/rental-scenario.ts';
import type {RentalScenario} from '../../../supabase/functions/_shared/rental-scenario.ts';
import {RentalScenarioInputs} from './RentalScenarioInputs';

export function RentalScenarioEditor({value,busy,onChange}:{value?:RentalScenario;busy:boolean;onChange:(value:RentalScenario)=>void}){
  let issues:string[]=[],calculation:ReturnType<typeof calculateRentalScenario>=null;
  if(value){try{issues=rentalScenarioIssues(validateRentalScenario(value));calculation=calculateRentalScenario(value);}catch{issues=['금액은 0~1,000조 원의 정수, 공실률은 0~100%로 입력해 주세요.'];}}
  return <div id="rental-scenario-editor"><h3>임대 운영수지 가정 계산 · 선택 기능</h3>
    <p>매입 후 임대 운영을 가정하는 계산입니다. 시세나 실제 수익률을 산정하지 않습니다. 비워 둔 항목은 0으로 채우지 않습니다.</p>
    {!value?<button type="button" className="button button-outline" disabled={busy} onClick={()=>onChange(emptyRentalScenario())}>임대 가정 계산 추가</button>:<>
      <fieldset disabled={busy}><legend>계산 모듈 사용과 공개 범위</legend>
        <label><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>임대 가정 계산 사용</label>
        <label>계산 공개 범위<select aria-label="계산 공개 범위" value={value.publication} onChange={e=>onChange({...value,publication:e.target.value as RentalScenario['publication']})}><option value="private">비공개 · 초안 보관</option><option value="approved">입력·출처·메모를 승인 후 고객 공개</option></select></label>
      </fieldset>
      <RentalScenarioInputs value={value} onChange={onChange} disabled={busy} metadata/>
      <label>고객에게 공개할 가정 메모 · 개인정보 제외<textarea maxLength={1000} disabled={busy} value={value.notes} onChange={e=>onChange({...value,notes:e.target.value})}/></label>
      {issues.length>0&&<div role="status"><p>계산 준비에 필요한 입력</p><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
      {calculation&&<p>가정 계산: 연 운영수지 {calculation.operatingBalanceWon.toLocaleString('ko-KR')}원 · 입력 매입가 대비 {calculation.operatingRatioPercent}%</p>}
      <p>연간 임대료와 운영비는 부가세 제외 금액입니다. 공실 차감 후 임대료 − 운영비로 계산하며 대출·이자, 취득·소득세, 초기 공사비를 포함하지 않습니다. 보증금은 매입가에서 차감하지 않습니다.</p>
    </>}
  </div>;
}
