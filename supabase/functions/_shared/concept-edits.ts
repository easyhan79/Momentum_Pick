import {purposesFor,type DecisionKind} from './customer-purpose.ts';
type Json=Record<string,any>;
export class ConceptError extends Error {code:string;constructor(code:string){super(code);this.code=code;}}
const obj=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
const fail=(code='invalid_concepts'):never=>{throw new ConceptError(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||required&&!value.trim())fail();return (value as string).trim();}
export async function validateConceptEdits(input:unknown,previous:Json[],planLookup:(id:string)=>Promise<{id:string;caption?:string}|undefined>,kind:DecisionKind='unknown'){
 if(!Array.isArray(input)||input.length>3)fail();
 const concepts:Json[]=[],seen=new Set<string>();
 for(const raw of input as unknown[]){
  const c=obj(raw),id=text(c.id,100,true),original=previous.find(p=>p.id===id);
  if(seen.has(id)||!original&&!/^concept-[123]$/.test(id))fail();seen.add(id);
  if(!Array.isArray(c.zones)||c.zones.length>5)fail();
  const zoneIds=new Set<string>();
  const zones=c.zones.map((value:unknown)=>{
    const z=obj(value),zoneId=text(z.id,100,true),position=obj(z.position);
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(zoneId)||zoneIds.has(zoneId))fail('invalid_zone');zoneIds.add(zoneId);
    if(z.position&&(!Number.isFinite(position.x)||!Number.isFinite(position.y)||position.x<0||position.x>100||position.y<0||position.y>100))fail('invalid_position');
    return {id:zoneId,label:text(z.label,100,true),title:text(z.title,120,true),body:text(z.body??'',2000),indoorOutdoor:['indoor','outdoor','site'].includes(z.indoorOutdoor)?z.indoorOutdoor:'unknown',evidence:z.evidence==='owner_provided'?'owner_provided':'ai_hypothesis',...(z.position?{position:{x:position.x,y:position.y}}:{})};
  });
  let purposeIds:string[]|undefined,purposeContext;
  if(c.purposeIds!==undefined){
    const allowed=purposesFor(kind);
    if(!Array.isArray(c.purposeIds)||c.purposeIds.length>8||new Set(c.purposeIds).size!==c.purposeIds.length||c.purposeIds.some((id:unknown)=>typeof id!=='string'||!allowed.some(p=>p.id===id)))fail('invalid_concept_purposes');
    purposeIds=[...c.purposeIds].sort();
    purposeContext=allowed.filter(p=>purposeIds!.includes(p.id)).map(p=>({id:p.id,label:p.label,requiredKeys:p.keys,constraints:p.risk,additionalCheck:p.document}));
  }
  let plan;
  if(c.plan){const planId=obj(c.plan).assetId;if(!uuid.test(planId||''))fail('invalid_plan');const source=await planLookup(planId);if(!source)fail('invalid_plan');plan={assetId:source!.id,caption:source!.caption||''};}
  concepts.push({id,conceptName:text(c.conceptName??original?.conceptName??'활용 방향',100,true),headline:text(c.headline??original?.headline??'',500),rationale:text(c.rationale??original?.rationale??'',2000),feasibility:'not_checked',zones,...(purposeIds?{purposeIds,purposeContext}:{}),...(plan?{plan}:{})});
 }
 return concepts;
}
function signature(c:Json){return JSON.stringify({purposeIds:[...(c.purposeIds||[])].sort(),conceptName:c.conceptName||'',headline:c.headline||'',rationale:c.rationale||'',zones:(c.zones||[]).map((z:Json)=>({id:z.id,label:z.label,title:z.title,body:z.body||''}))});}
export function changedConceptSlots(previous:Json[],next:Json[]){
 return [...new Set([...previous,...next].map(c=>c.id))].filter(id=>{const before=previous.find(c=>c.id===id),after=next.find(c=>c.id===id);return !before||!after||signature(before)!==signature(after);});
}
