import {normalizeCopy} from './blogPreview';
import {parseNewsCards} from './cardNews';
export function reviewCopy(value:string,channel:'blog'|'cards'){
 const text=normalizeCopy(value),issues:string[]=[];
 if(channel==='blog'){
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!/^#\s+/.test(lines[0]||''))issues.push('제목을 한 줄로 분리해 주세요.');
  if((lines[0]||'').replace(/^#\s+/,'').length>60)issues.push('제목이 너무 깁니다.');
  if(text.length<1200)issues.push('독자의 판단을 돕는 본문 설명이 부족합니다.');
  if((text.match(/^##\s+.+/gm)||[]).length<4)issues.push('본문을 소제목별로 나눠야 합니다.');
  if(text.split(/\n\s*\n/).some(p=>p.length>360))issues.push('긴 문단을 나눠야 합니다.');
 }else{
  const cards=parseNewsCards(text);
  if(cards.length!==5)issues.push('카드 1~5의 순서와 내용을 확인해야 합니다.');
  if(cards.some(card=>{const lines=card.body.split('\n').filter(Boolean);return card.body.length>150||lines.length<2||(lines[0]||'').length>28;}))issues.push('카드는 짧은 제목과 설명으로 나눠야 합니다.');
 }
 if(/독점|급매|수익률\s*보장|확정\s*수익|완벽한|매머드급|무조건|상위\s*1\s*%/.test(text))issues.push('근거를 확인하기 어려운 과장 표현이 있습니다.');
 return issues;
}
