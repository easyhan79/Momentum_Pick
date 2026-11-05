import {useState} from 'react';
import {calculateRentalScenario,scenarioInputLabels} from '../../../supabase/functions/_shared/rental-scenario.ts';
import type {RentalScenario,ScenarioKey} from '../../../supabase/functions/_shared/rental-scenario.ts';
import {RentalScenarioInputs} from './RentalScenarioInputs';

export function RentalScenarioView({scenario,privatePreview=false}:{scenario:RentalScenario;privatePreview?:boolean}){
  const [current,setCurrent]=useState(scenario);
  const changed=JSON.stringify(current)!==JSON.stringify(scenario);
  let result:ReturnType<typeof calculateRentalScenario>=null;
  try{result=calculateRentalScenario(current);}catch{/* Invalid local input never produces a result. */}
  const money=(value:number)=>value.toLocaleString('ko-KR')+'원';
  return <section id="rental-scenario" className="section-shell property-location"><div className="glass property-terms">
    <p className="eyebrow">RENTAL WHAT-IF</p><h2>임대 운영수지 가정 계산</h2>
    <p>{privatePreview?'관리자 초안 미리보기 · '+(scenario.publication==='private'?'비공개':'공개 승인 대상'):'관리자 승인 가정값'} · 실제 수익률·감정평가가 아닙니다.</p>
    <p>입력값을 바꾸어 결과를 비교하세요. 변경은 현재 화면에서만 적용됩니다.</p>
    <RentalScenarioInputs value={current} onChange={setCurrent}/>
    <button type="button" className="button button-outline" disabled={!changed} onClick={()=>setCurrent(scenario)}>처음 가정값으로 복원</button>
    <p role="status">{changed?'방문자가 변경한 임시 가정으로 계산 중':'처음 입력된 가정으로 계산 중'}</p>
    {result?<dl className="rental-results" aria-label="임대 가정 계산 결과" aria-live="polite">
      <div><dt>연 공실 차감액</dt><dd>{money(result.vacancyLossWon)}</dd></div>
      <div><dt>공실 반영 연 임대료</dt><dd>{money(result.collectedRentWon)}</dd></div>
      <div><dt>연 운영수지</dt><dd>{money(result.operatingBalanceWon)}</dd></div>
      <div><dt>입력 매입가 대비 운영수지 비율</dt><dd>{result.operatingRatioPercent}%</dd></div>
    </dl>:<p role="status">모든 항목과 유효한 매입가가 필요합니다. 제공자료로 지정한 값은 출처 설명도 필요합니다.</p>}
    <details><summary>처음 입력값과 근거 보기</summary><dl>{(Object.keys(scenarioInputLabels) as ScenarioKey[]).map(key=><div key={key}><dt>{scenarioInputLabels[key]}</dt><dd>{scenario[key].value===null?'미입력':key==='vacancyBps'?`${scenario[key].value!/100}%`:money(scenario[key].value!)} · {scenario[key].basis==='provided'?'제공자료 · 미검증':'사용자 가정'}{scenario[key].sourceText?` · ${scenario[key].sourceText}`:''}</dd></div>)}</dl>{scenario.notes&&<p>{scenario.notes}</p>}</details>
    <p>계산식: 연 임대료 × (1 − 공실률) − 연 운영비. 비율은 이 운영수지를 입력 매입가로 나눈 값입니다. 공실 차감액은 원 단위로 반올림하고 비율은 소수 둘째 자리까지 표시합니다.</p>
    <p>부가세 제외 금액 기준입니다. 대출·이자, 취득·소득세, 초기 공사비는 제외하며 보증금은 매입가에서 차감하지 않습니다. 시장 임대료·공실률이나 매출을 자동 추정하지 않습니다.</p>
  </div></section>;
}
