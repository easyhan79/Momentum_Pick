export type NewsCard={number:number;body:string};
// Accept only an explicit, ordered five-card outline; never guess missing claims.
export function parseNewsCards(caption:string):NewsCard[]{
  const normalized=caption.replace(/\\r\\n|\\n/g,'\n').replace(/\r\n/g,'\n');
  const markers=[...normalized.matchAll(/(?:^|\n)[ \t]*\[카드\s*(\d+)\][ \t]*/g)];
  if(markers.length!==5||markers.some((m,i)=>Number(m[1])!==i+1))return [];
  const cards=markers.map((m,i)=>({number:i+1,body:normalized.slice(m.index!+m[0].length,markers[i+1]?.index??normalized.length).split(/\n\s*(?:※|#)/)[0].trim()}));
  return cards.every(card=>card.body.length>0)?cards:[];
}

export function wrapCardText(context:Pick<CanvasRenderingContext2D,'measureText'>,text:string,width:number):string[]{
  const lines:string[]=[];
  for(const paragraph of text.split('\n')){
    let line='';
    for(const char of Array.from(paragraph)){
      if(line&&context.measureText(line+char).width>width){lines.push(line.trimEnd());line=char.trimStart();}
      else line+=char;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Card text uses the bundled Pretendard font so images look the same on every computer.
export const CARD_FONT='"Pretendard Variable"';
export function drawNewsCard(canvas:HTMLCanvasElement,card:NewsCard,photo?:HTMLImageElement,imageLabel?:string):boolean{
  canvas.width=1080;canvas.height=1350;
  const ctx=canvas.getContext('2d');if(!ctx)return false;
  const background=ctx.createLinearGradient(0,0,1080,1350);background.addColorStop(0,'#142a38');background.addColorStop(1,'#08121d');ctx.fillStyle=background;ctx.fillRect(0,0,1080,1350);
  if(photo){const scale=Math.max(1080/photo.naturalWidth,1350/photo.naturalHeight),w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;ctx.drawImage(photo,(1080-w)/2,(1350-h)/2,w,h);ctx.fillStyle='rgba(4,15,25,0.82)';ctx.fillRect(0,0,1080,1350);}
  ctx.strokeStyle='#c5a870';ctx.lineWidth=2;ctx.strokeRect(52,52,976,1246);
  ctx.fillStyle='#c5a870';ctx.font='500 24px "Pretendard Variable", sans-serif';ctx.fillText('SPACEPICK',88,110);
  ctx.fillStyle='#69b49e';ctx.font='500 22px "Pretendard Variable", sans-serif';ctx.fillText(photo?(imageLabel||'제공 자료 · 검수 전'):'PROPERTY CONTENT STUDIO',88,161);
  ctx.fillStyle='#c5a870';ctx.font='500 122px "Pretendard Variable", sans-serif';ctx.fillText(String(card.number).padStart(2,'0'),82,330);
  ctx.fillStyle='#86939d';ctx.font='24px "Pretendard Variable", sans-serif';ctx.fillText('/ 05',260,327);
  ctx.fillStyle='#c5a870';ctx.fillRect(88,380,80,5);
  const [headline,...paragraphs]=card.body.split('\n'),body=paragraphs.join('\n').trim();
  let titleSize=64,titleLines:string[]=[];
  for(;titleSize>=32;titleSize-=2){ctx.font=`700 ${titleSize}px "Pretendard Variable", "Malgun Gothic", sans-serif`;titleLines=wrapCardText(ctx,headline,896);if(titleLines.length*titleSize*1.4<=300)break;}
  const titleHeight=titleLines.length*titleSize*1.4;
  let fontSize=42,lines:string[]=[];
  for(;fontSize>=26;fontSize-=2){ctx.font=`400 ${fontSize}px "Pretendard Variable", "Malgun Gothic", sans-serif`;lines=body?wrapCardText(ctx,body,896):[];if(titleHeight+48+lines.length*fontSize*1.65<=710)break;}
  const fits=titleSize>=32&&fontSize>=26;
  ctx.fillStyle='#f0eee7';ctx.textBaseline='top';
  if(fits){ctx.font=`700 ${titleSize}px "Pretendard Variable", "Malgun Gothic", sans-serif`;titleLines.forEach((line,i)=>ctx.fillText(line,88,440+i*titleSize*1.4));ctx.fillStyle='#c5d1d1';ctx.font=`400 ${fontSize}px "Pretendard Variable", "Malgun Gothic", sans-serif`;lines.forEach((line,i)=>ctx.fillText(line,88,440+titleHeight+48+i*fontSize*1.65));}
  else {ctx.font='500 36px "Pretendard Variable", sans-serif';ctx.fillText('문구가 너무 깁니다.',88,470);ctx.fillText('구성안에서 이 카드의 내용을 줄여 주세요.',88,540);}
  ctx.textBaseline='alphabetic';ctx.strokeStyle='#33434d';ctx.beginPath();ctx.moveTo(88,1195);ctx.lineTo(992,1195);ctx.stroke();
  ctx.fillStyle='#c5a870';ctx.font='500 25px "Pretendard Variable", "Malgun Gothic", sans-serif';ctx.fillText('제공 자료 기반 · SPACEPICK',88,1246);
  ctx.fillStyle='#a2adb3';ctx.font='20px "Pretendard Variable", "Malgun Gothic", sans-serif';ctx.fillText('가격·거래 조건은 상담 시 확인',88,1280);
  return fits;
}
