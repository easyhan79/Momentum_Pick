// Text formatting never promotes source claims to verified facts.
export const copyReviewLabels={provided_information:'제공정보 · 미검증',provided_claim:'제공자 주장 · 미검증',usage_hypothesis:'활용 가설',needs_confirmation:'확인 필요'} as const;
export type CopyReviewItem={category:keyof typeof copyReviewLabels;statement:string;check:string};
const marker=()=>/\[\s*(사실\s*조건|사실\s*주장|제공\s*정보|제공\s*주장|활용\s*가설)\s*\][ \t]*/g;
const replacements:Record<string,string>={'사실조건':'제공자료에 따르면 ','사실주장':'제공자료에 따르면 ','제공정보':'제공자료에 따르면 ','제공주장':'제공자 설명에 따르면 ','활용가설':'활용 방향은 검토 단계입니다. '};
export function naturalCustomerCopy(value:unknown):string{
 return typeof value==='string'?value.replace(marker(),(_match,label:string)=>replacements[label.replace(/\s/g,'')]):'';
}
const text=(value:unknown)=>typeof value==='string'?value.trim().slice(0,1000):'';
export function customerCopyReview(value:unknown):CopyReviewItem[]{
 const source=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const result:CopyReviewItem[]=[];
 if(Array.isArray(source.copy_review))for(const item of source.copy_review.slice(0,20)){
  if(!item||typeof item!=='object'||!Object.hasOwn(copyReviewLabels,item.category)||!text(item.statement))continue;
  result.push({category:item.category,statement:text(item.statement),check:text(item.check)||'원자료와 기재 내용을 대조해야 합니다.'});
 }
 if(result.length)return result;
 // Legacy AI labels remain inspectable in this admin-only response.
 const originals=source._copy_original&&typeof source._copy_original==='object'?source._copy_original as Record<string,unknown>:{};
 for(const field of ['usp_summary','landing_copy','target_1_blog','target_2_blog','insta_caption']){
  const raw=typeof originals[field]==='string'?originals[field]:source[field];
  if(typeof raw!=='string')continue;
  const bounded=raw.slice(0,18000),matches=[...bounded.matchAll(marker())];
  for(let index=0;index<matches.length&&result.length<20;index++){
   const match=matches[index],label=match[1].replace(/\s/g,'');
   const statement=bounded.slice(match.index!+match[0].length,matches[index+1]?.index).trim().slice(0,1000);
   if(statement)result.push({category:label==='활용가설'?'usage_hypothesis':label==='제공주장'?'provided_claim':'provided_information',statement,check:'기존 AI 문안의 구분입니다. 실제 원자료와 대조하고 미확인 조건을 문장에 남겨 주세요.'});
  }
 }
 return result;
}
