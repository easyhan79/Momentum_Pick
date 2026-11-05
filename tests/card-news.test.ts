import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNewsCards,wrapCardText,drawNewsCard} from '../showroom-web/src/lib/cardNews.ts';
const outline=Array.from({length:5},(_,i)=>`[카드 ${i+1}] 한글 구성 ${i+1}`).join('\n');
test('five explicit cards support actual and escaped newlines without inventing facts',()=>{
  for(const input of [outline,outline.replace(/\n/g,'\\n')]){const cards=parseNewsCards(input+'\n\n※ 검증 필요\n#태그');assert.equal(cards.length,5);assert.equal(cards[4].body,'한글 구성 5');assert.equal(cards[0].number,1);}
});
test('missing, duplicate, unordered, extra and empty cards are blocked',()=>{
  for(const input of ['',outline.replace('[카드 2]','[카드 1]'),outline.replace('[카드 2] 한글 구성 2\n',''),outline+'\n[카드 6] 추가',outline.replace('한글 구성 3','')])assert.deepEqual(parseNewsCards(input),[]);
});
test('wrapping preserves Korean and emoji without splitting code points or silently truncating',()=>{
  const ctx={measureText:(s:string)=>({width:Array.from(s).length*20})} as Pick<CanvasRenderingContext2D,'measureText'>;
  const input='한글😀텍스트'.repeat(100);const lines=wrapCardText(ctx,input,100);assert.equal(lines.join(''),input);assert.ok(lines.every(line=>Array.from(line).length<=5));assert.deepEqual(wrapCardText(ctx,'첫째\n\n둘째',100),['첫째','','둘째']);
});
test('photo background uses cover crop; long text blocks export without silently dropping content',()=>{
  let imageArgs:unknown[]=[];const text:string[]=[];
  const ctx={createLinearGradient:()=>({addColorStop(){}}),fillRect(){},strokeRect(){},fillText(s:string){text.push(s);},drawImage(...args:unknown[]){imageArgs=args;},measureText:(s:string)=>({width:s.length*20}),beginPath(){},moveTo(){},lineTo(){},stroke(){}};
  const canvas={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const photo={naturalWidth:2000,naturalHeight:1000} as HTMLImageElement;
  assert.equal(drawNewsCard(canvas,{number:1,body:'확인할 매물 사진'},photo),true);assert.equal(canvas.width,1080);assert.equal(canvas.height,1350);assert.deepEqual(imageArgs,[photo,-810,0,2700,1350]);assert.ok(text.includes('제공 자료 기반 · SPACEPICK'));
  assert.equal(drawNewsCard(canvas,{number:2,body:'가'.repeat(10000)}),false);assert.ok(text.includes('문구가 너무 깁니다.'));
});
