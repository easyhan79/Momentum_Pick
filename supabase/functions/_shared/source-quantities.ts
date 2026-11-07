export function sourceQuantities(text:string){
 const result:{original:string;context:string;value:string;unit:string;approximate:boolean}[]=[];
 const pattern=/(?<![\d.,-])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(억원|억|만원|원|평|㎡|m²)(?![\d.,가-힣])/g;
 // Mixed Korean denominations are left for manual review as a whole;
 // extracting only the trailing amount would misrepresent the source.
 const input=text.slice(0,16000).replace(/\d[\d,]*(?:\.\d+)?\s*억\s*\d[\d,]*(?:천|백)?\s*만(?:원)?/g,v=>' '.repeat(v.length));
 for(const match of input.matchAll(pattern)){
  if(result.length>=12)break;
  const number=match[1].replaceAll(',','');if(number.length>20)continue;
  const [whole,fraction='']=number.split('.'),numerator=BigInt(whole+fraction),denominator=10n**BigInt(fraction.length),unit=match[2];
  const money=['억원','억','만원','원'].includes(unit),factor=unit.startsWith('억')?100000000n:unit==='만원'?10000n:1n;
  if(money){const total=numerator*factor;if(total%denominator!==0n||total/denominator>1000000000000000n)continue;result.push({original:match[0],context:text.slice(Math.max(0,match.index!-15),match.index!+match[0].length+15),value:(total/denominator).toLocaleString('ko-KR'),unit:'원',approximate:false});}
  else{const amount=Number(numerator)/Number(denominator)*(unit==='평'?400/121:1);if(!Number.isFinite(amount)||amount>1e12)continue;result.push({original:match[0],context:text.slice(Math.max(0,match.index!-15),match.index!+match[0].length+15),value:amount.toLocaleString('ko-KR',{maximumFractionDigits:6}),unit:'㎡',approximate:unit==='평'});}
 }
 return result;
}
