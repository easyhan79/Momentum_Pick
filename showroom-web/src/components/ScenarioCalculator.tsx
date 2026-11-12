import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Showroom } from '../types/showroom';

const number = (value: number) => new Intl.NumberFormat('ko-KR').format(value);

export function ScenarioCalculator({ data }: { data: Showroom }) {
  const model = data.calculator;
  if (data.category !== 'commercial' || !model?.enabled) return null;
  return <Calculator model={model} />;
}

function Calculator({ model }: { model: NonNullable<Showroom['calculator']> }) {
  const [spend, setSpend] = useState(model.spend);
  const [teams, setTeams] = useState(model.teams);
  const [margin, setMargin] = useState(model.margin);
  const revenue = spend * teams * model.days;
  return <section id="calculator" className="calculator-band"><div className="section-shell">
    <div className="section-top"><div><p className="eyebrow">SCENARIO LAB</p><h2>가정을 바꾸며, 운영을 생각하다.</h2></div><span className="evidence-tag">사용자 입력 기반 예시</span></div>
    <div className="calculator-grid"><div className="calculator-inputs glass"><h3><SlidersHorizontal size={18} /> 운영 시나리오 입력</h3>
      {[{id:'spend',label:'1팀당 평균 결제액',value:spend,min:10000,max:60000,step:5000,suffix:'원',set:setSpend},{id:'teams',label:'하루 평균 방문 팀 수',value:teams,min:20,max:100,step:5,suffix:'팀',set:setTeams},{id:'margin',label:'가정 이익률',value:margin,min:20,max:60,step:5,suffix:'%',set:setMargin}].map(input => <div className="slider-field" key={input.id}><label htmlFor={`slider-${input.id}`}>{input.label}<output htmlFor={`slider-${input.id}`}>{number(input.value)}{input.suffix}</output></label><input id={`slider-${input.id}`} type="range" min={input.min} max={input.max} step={input.step} value={input.value} onChange={e => input.set(Number(e.target.value))} /><div className="slider-extents"><span>{number(input.min)}{input.suffix}</span><span>{number(input.max)}{input.suffix}</span></div></div>)}
    </div><div className="calculator-output"><span className="small-label">ILLUSTRATIVE RESULT / {model.days}일 가정</span><p>가정에 따른 월 매출</p><output id="out-revenue">{number(Math.round(revenue / 10000))}<small>만 원</small></output><div className="profit-result"><span>가정에 따른 단순 이익 추정</span><output id="out-profit">{number(Math.round(revenue * margin / 100 / 10000))}<small>만 원</small></output></div><p className="calculation-formula">결제액 × 일평균 팀 수 × {model.days}일<br />단순 이익 = 가정 매출 × 가정 이익률</p></div></div>
    <div className="calculator-assumptions"><p>{model.source}</p><ul>{model.assumptions.map(text => <li key={text}>{text}</li>)}</ul></div>
  </div></section>;
}
