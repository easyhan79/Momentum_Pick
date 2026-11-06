export const rewriteFields=['subtitle','summary','target_1_blog','target_2_blog','insta_caption'] as const;
export type RewriteField=typeof rewriteFields[number];
export const rewriteLabels:Record<RewriteField,string>={subtitle:'쇼룸 제목',summary:'쇼룸 요약',target_1_blog:'블로그 · 타깃 1',target_2_blog:'블로그 · 타깃 2',insta_caption:'카드뉴스 문구'};
const object=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=(v:any,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export function selectedRewriteFields(value:unknown):RewriteField[]{
 if(!Array.isArray(value)||!value.length||value.length>5||new Set(value).size!==value.length||value.some(v=>!rewriteFields.includes(v)))throw Error('rewrite_invalid');
 return rewriteFields.filter(f=>value.includes(f));
}
export function rewriteSnapshot(draft:Record<string,any>,property:Record<string,any>){
 const profile=object(draft.propertyProfile),ai=object(property.ai_contents),saved=object(draft.marketing);
 const original=Object.fromEntries(rewriteFields.map(f=>[f,text(f==='summary'||f==='subtitle'?draft[f]:Object.hasOwn(saved,f)?saved[f]:ai[f],f==='summary'?4000:f==='subtitle'?100:18000)]));
 const clean=(v:string)=>v.replace(/\[(?:FILE|DOCUMENT)_ID:[^\]]*\]/g,'');
 const source={title:text(draft.title,200),address:text(draft.address,300),kind:text(profile.kind||draft.category,40),transaction:profile.transaction,price:profile.price,
  fields:(Array.isArray(profile.fields)?profile.fields:[]).filter((f:any)=>f.useApproved===true&&['provided','verified'].includes(f.status)).map((f:any)=>({key:f.key,label:f.label,value:f.value,unit:f.unit,status:f.status,source:f.sourceText,asOf:f.asOf})),
  // Legacy raw text supplies context only when no structured profile exists.
  legacyProvidedText:profile.version?undefined:clean(text(property.raw_input,16000))};
 return {original,source};
}
export function rewriteJob(row:Record<string,any>){
 const fields=rewriteFields.filter(f=>Array.isArray(row.fields)&&row.fields.includes(f));
 const copy=(value:any)=>Object.fromEntries(fields.map(f=>[f,text(object(value)[f],f==='summary'?4000:f==='subtitle'?100:18000)]));
 return {id:row.id,baseRevision:row.base_revision,fields,instruction:text(row.instruction,1000),state:row.state,attempts:row.attempts,
  errorCode:/^[a-z0-9_]{1,60}$/.test(row.last_error_code)?row.last_error_code:'',original:copy(row.original),result:row.state==='done'||row.state==='applied'?copy(row.result):null,createdAt:row.created_at,updatedAt:row.updated_at};
}
export async function dispatchRewrite(tokens:string[],fetcher:typeof fetch){
 for(const token of [...new Set(tokens.filter(Boolean))]){try{const r=await fetcher('https://api.github.com/repos/easyhan79/Momentum_Pick/actions/workflows/copy-rewrite.yml/dispatches',{method:'POST',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'Spacepick-Copy','Content-Type':'application/json'},body:JSON.stringify({ref:'main'}),redirect:'error',signal:AbortSignal.timeout(5000)});if(r.status===204)return true;}catch{/* Bounded scheduled recovery. */}}
 return false;
}
