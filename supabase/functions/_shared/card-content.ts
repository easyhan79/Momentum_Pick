export type NewsCard={number:number;body:string};
// Only an explicit ordered five-card outline can become an approved artifact.
export function parseNewsCards(caption:string):NewsCard[]{
 const normalized=caption.replace(/\\r\\n|\\n/g,'\n').replace(/\r\n/g,'\n');
 const markers=[...normalized.matchAll(/(?:^|\n)[ \t]*\[카드\s*(\d+)\][ \t]*/g)];
 if(markers.length!==5||markers.some((m,i)=>Number(m[1])!==i+1))return [];
 const cards=markers.map((m,i)=>({number:i+1,body:normalized.slice(m.index!+m[0].length,markers[i+1]?.index??normalized.length).split(/\n\s*(?:※|#)/)[0].trim()}));
 return cards.every(card=>card.body.length>0)?cards:[];
}
