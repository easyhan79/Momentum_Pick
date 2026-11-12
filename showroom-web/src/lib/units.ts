// Korean real-estate units. Values are always stored as ㎡ and 원; 평 and 억·만원 are input/display only.
export const SQM_PER_PYEONG=400/121; // 1평 = 3.3057…㎡

const round=(value:number,digits:number)=>{const f=10**digits;return Math.round(value*f)/f;};

export function pyeongToSqm(pyeong:number){return round(pyeong*SQM_PER_PYEONG,2);}
export function sqmToPyeong(sqm:number){return round(sqm/SQM_PER_PYEONG,2);}

export function formatArea(sqm:number|null|undefined){
  if(sqm===null||sqm===undefined||!Number.isFinite(sqm))return '';
  return `${sqm.toLocaleString('ko-KR',{maximumFractionDigits:2})}㎡ (${sqmToPyeong(sqm).toLocaleString('ko-KR',{maximumFractionDigits:2})}평)`;
}

export function splitWon(won:number|null|undefined){
  if(won===null||won===undefined||!Number.isFinite(won))return {eok:null,man:null};
  const eok=Math.floor(won/100_000_000),man=round((won-eok*100_000_000)/10_000,4);
  return {eok,man};
}

// Returns null when both parts are empty, otherwise an integer number of 원.
export function joinWon(eok:number|null,man:number|null){
  if(eok===null&&man===null)return null;
  return Math.round((eok||0)*100_000_000+(man||0)*10_000);
}

export function formatWon(won:number|null|undefined){
  if(won===null||won===undefined||!Number.isFinite(won))return '';
  const {eok,man}=splitWon(won);
  const parts=[eok?`${eok.toLocaleString('ko-KR')}억`:'',man?`${man.toLocaleString('ko-KR',{maximumFractionDigits:4})}만`:''].filter(Boolean);
  return `${parts.length?parts.join(' '):'0'} 원 (${won.toLocaleString('ko-KR')}원)`;
}
