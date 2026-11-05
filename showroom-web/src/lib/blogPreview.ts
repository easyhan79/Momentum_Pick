export type BlogBlock={kind:'heading'|'paragraph';text:string};
export function normalizeCopy(value:string){return value.replace(/\\r\\n|\\n|\\r/g,'\n').replace(/\r\n/g,'\n').replace(/\u00a0/g,' ');}
export function parseBlog(value:string){
 const lines=normalizeCopy(value).replace(/\s*■\s*/g,'\n■ ').split('\n').map(s=>s.trim()).filter(Boolean);
 const titleIndex=lines.findIndex(s=>/^(?:#{1,2}\s+|제목\s*[:：])/.test(s));
 const candidate=titleIndex<0?0:titleIndex;
 const selected=(lines[candidate]||'').length<=100?candidate:-1;
 const title=(selected<0?'매물 소개':lines[selected]||'광고 초안').replace(/^(?:#{1,2}\s*|제목\s*[:：]\s*)/,'').replace(/\*\*/g,'');
 const blocks:BlogBlock[]=lines.filter((_,i)=>i!==selected).map(text=>({kind:/^(?:■|#{1,4}\s|\d+[.)]\s)/.test(text)&&text.length<180?'heading':'paragraph',text:text.replace(/^(?:■\s*|#{1,4}\s*)/,'')}));
 return {title,blocks};
}
