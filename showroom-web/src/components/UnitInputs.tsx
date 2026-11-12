import {useEffect,useId,useState} from 'react';
import {formatArea,formatWon,joinWon,pyeongToSqm,splitWon,sqmToPyeong} from '../lib/units';

const parse=(text:string)=>text.trim()===''?null:Number(text);
const show=(value:number|null)=>value===null?'':String(value);

// Area entered in 평 (default) or ㎡; onChange always receives ㎡.
export function AreaInput({label,value,onChange,disabled=false}:{label:string;value:number|null;onChange:(sqm:number|null)=>void;disabled?:boolean}){
  const id=useId();
  const [unit,setUnit]=useState<'pyeong'|'sqm'>('pyeong');
  const toUnit=(sqm:number|null)=>sqm===null?null:unit==='pyeong'?sqmToPyeong(sqm):sqm;
  const [text,setText]=useState(show(toUnit(value)));
  const toSqm=(entered:number|null)=>entered===null||!Number.isFinite(entered)?null:unit==='pyeong'?pyeongToSqm(entered):entered;
  // Follow outside changes (e.g. loading a saved draft) without fighting the admin's typing.
  useEffect(()=>{if(toSqm(parse(text))!==value)setText(show(toUnit(value)));},[value,unit]);
  return <div className="unit-input">
    <label htmlFor={id}>{label}</label>
    <div className="unit-input-row">
      <input id={id} type="number" min="0" step="any" inputMode="decimal" disabled={disabled} value={text} onChange={e=>{setText(e.target.value);onChange(toSqm(parse(e.target.value)));}}/>
      <select aria-label={`${label} 단위`} disabled={disabled} value={unit} onChange={e=>setUnit(e.target.value as 'pyeong'|'sqm')}><option value="pyeong">평</option><option value="sqm">㎡</option></select>
    </div>
    {value!==null&&<small className="unit-readout">{formatArea(value)}</small>}
  </div>;
}

// Money entered as 억 + 만원; onChange always receives 원.
export function WonInput({label,value,onChange,disabled=false}:{label:string;value:number|null;onChange:(won:number|null)=>void;disabled?:boolean}){
  const id=useId();
  const initial=splitWon(value);
  const [eok,setEok]=useState(show(initial.eok)),[man,setMan]=useState(show(initial.man));
  useEffect(()=>{if(joinWon(parse(eok),parse(man))!==value){const next=splitWon(value);setEok(show(next.eok));setMan(show(next.man));}},[value]);
  const emit=(nextEok:string,nextMan:string)=>{const a=parse(nextEok),b=parse(nextMan);onChange(a!==null&&!Number.isFinite(a)||b!==null&&!Number.isFinite(b)?null:joinWon(a,b));};
  return <div className="unit-input">
    <label htmlFor={id}>{label}</label>
    <div className="unit-input-row">
      <input id={id} type="number" min="0" step="1" inputMode="numeric" aria-label={`${label} 억`} disabled={disabled} value={eok} onChange={e=>{setEok(e.target.value);emit(e.target.value,man);}}/><span>억</span>
      <input type="number" min="0" step="any" inputMode="decimal" aria-label={`${label} 만원`} disabled={disabled} value={man} onChange={e=>{setMan(e.target.value);emit(eok,e.target.value);}}/><span>만원</span>
    </div>
    {value!==null&&<small className="unit-readout">{formatWon(value)}</small>}
  </div>;
}
