// 기획서 (content brief): who the listing is for, its three key selling points with their sources and the
// tone. It starts from the analysis' salesStrategy, is confirmed by the admin once ("확인 1"), and then
// drives the rewritten showroom/blog/card copy and the image prompts so every output carries one message.
type Json=Record<string,any>;
export type BriefTone='professional'|'friendly'|'premium';
export type BriefPoint={fact:string;buyerBenefit:string;source:string};
export type Brief={version:1;target:string;tone:BriefTone;points:BriefPoint[];avoid:string;updatedAt?:string;updatedBy?:string};
export const briefTones:Record<BriefTone,string>={professional:'전문적이고 신뢰감 있게',friendly:'친근하고 쉽게',premium:'고급스럽게'};

export class BriefError extends Error{code='invalid_brief';}
const obj=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
const str=(v:unknown,max:number)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
const strict=(v:unknown,max:number,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw new BriefError();return v.trim();};

// Default brief proposed from the analysis result; nothing is invented when the strategy is missing.
export function briefFromStrategy(strategy:unknown):Brief{
  const s=obj(strategy),segments=Array.isArray(s.buyerSegments)?s.buyerSegments:[],points=Array.isArray(s.sellingPoints)?s.sellingPoints:[];
  const constraints=Array.isArray(s.materialConstraints)?s.materialConstraints:[];
  return {version:1,target:str(obj(segments[0]).label,100),tone:'professional',
    points:points.slice(0,3).map((p:unknown)=>{const point=obj(p),refs=Array.isArray(point.sourceRefs)?point.sourceRefs:[];
      return {fact:str(point.fact,300),buyerBenefit:str(point.buyerBenefit,300),source:str(refs.map((r:unknown)=>obj(r).excerpt).filter(Boolean).join(' / ')||'등록자 제공자료',300)};}).filter(p=>p.fact),
    avoid:str(constraints.map((c:unknown)=>obj(c).description).filter(Boolean).slice(0,5).join(' / '),500)};
}

export function targetOptions(strategy:unknown){
  const segments=obj(strategy).buyerSegments;
  return (Array.isArray(segments)?segments:[]).map((s:unknown)=>({label:str(obj(s).label,100),rationale:str(obj(s).rationale,300)})).filter(s=>s.label);
}

export function validateBrief(value:unknown):Brief{
  const v=obj(value);
  if(v.version!==1||!Object.hasOwn(briefTones,v.tone)||!Array.isArray(v.points)||v.points.length>3)throw new BriefError();
  const points=v.points.map((p:unknown)=>{const point=obj(p);return {fact:strict(point.fact,300,true),buyerBenefit:strict(point.buyerBenefit,300),source:strict(point.source,300)};});
  return {version:1,target:strict(v.target,100),tone:v.tone as BriefTone,points,avoid:strict(v.avoid,500)};
}

// Direction given to the existing copy rewrite job (limited to 1,000 characters).
export function briefInstruction(brief:Brief):string{
  const lines=['아래 기획서에 맞춰 모든 글을 같은 메시지로 다시 써 주세요.'];
  if(brief.target)lines.push(`타깃 고객: ${brief.target}`);
  if(brief.points.length)lines.push('핵심 장점(이 순서로 강조): '+brief.points.map((p,i)=>`${i+1}) ${p.fact}${p.buyerBenefit?` → ${p.buyerBenefit}`:''}`).join(' '));
  lines.push(`글 톤: ${briefTones[brief.tone]}`);
  if(brief.avoid)lines.push(`주의·피할 표현: ${brief.avoid}`);
  lines.push('사실은 제공 자료 범위 안에서만 쓰고, 숫자·인허가·수익을 새로 만들지 마세요.');
  let text=lines.join('\n');
  if(text.length>1000)text=text.slice(0,999)+'…';
  return text;
}
