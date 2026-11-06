import {purposesFor} from './customer-purpose.ts';
import {publicDecision} from './customer-decision.ts';
import {profileFacts,publicProfileHighlights,profileSummary,visibleField} from './property-profile.ts';
import {publicRentalScenario} from './rental-scenario.ts';
type Json=Record<string,any>;
const obj=(v:unknown):Json=>v&&typeof v==='object'&&!Array.isArray(v)?v as Json:{};
const str=(v:unknown,n=2000)=>typeof v==='string'?v.slice(0,n):'';
const list=(v:unknown)=>Array.isArray(v)?v:[];
export function publicDto(value:unknown){
 const d=obj(value);if(d.schema_version!=='1.0'||!str(d.title)||!str(d.subtitle))return null;
 let facts=list(d.facts),highlights:ReturnType<typeof publicProfileHighlights>|undefined;
 if(d.propertyProfile){try{if(d.propertyProfile.version!==1)return null;facts=profileFacts(d.propertyProfile);highlights=publicProfileHighlights(d.propertyProfile);}catch{return null;}}
 const contact=d.registration?.channel==='web'&&d.registration.contact?.publicApproved===true?{name:str(d.registration.contact.name,100),phone:str(d.registration.contact.phone,50)}:undefined;
 const customerDecision=d.propertyProfile?publicDecision(d.propertyProfile,d.propertyProfile.fields.filter((f:any)=>visibleField(f,d.propertyProfile))):undefined;
 const rentalScenario=publicRentalScenario(d.propertyProfile?.modules?.rentalScenario);
 return {...(customerDecision?{customerDecision}:{}),...(rentalScenario?{rentalScenario}:{}),...(contact?{publicContact:contact}:{}),...(highlights?{highlights,propertySummary:profileSummary(d.propertyProfile)}:{}),schema_version:'1.0',id:str(d.id,100),category:['commercial','industrial','land','income'].includes(d.category)?d.category:'unknown',title:str(d.title,200),subtitle:str(d.subtitle,100),summary:str(d.summary,4000),address:str(d.address,300),addressEvidence:'owner_provided',
 facts:facts.slice(0,60).map(v=>{const f=obj(v);return{...(d.propertyProfile&&['verified','provided','inferred','generated','unknown'].includes(f.status)?{status:f.status}:{}),...(typeof f.asOf==='string'?{asOf:str(f.asOf,10)}:{}),key:str(f.key,100),label:str(f.label,100),value:f.value===null?null:typeof f.value==='number'&&Number.isFinite(f.value)?f.value:str(f.value,2000),unit:str(f.unit,30),evidence:['verified','owner_provided','ai_hypothesis','needs_review'].includes(f.evidence)?f.evidence:'needs_review',source:str(f.source,500)};}),
 concepts:list(d.concepts).slice(0,3).map(v=>{const c=obj(v);return{...(Array.isArray(c.purposeIds)?{purposeIds:c.purposeIds.filter((id:any)=>purposesFor(d.propertyProfile?.kind||d.category||'unknown').some(p=>p.id===id)).slice(0,8)}:{}),id:str(c.id,100),conceptName:str(c.conceptName,100),headline:str(c.headline,500),rationale:str(c.rationale),feasibility:'not_checked',zones:list(c.zones).slice(0,5).map(v=>{const z=obj(v);return{id:str(z.id,100),label:str(z.label,100),title:str(z.title,120),body:str(z.body),indoorOutdoor:'unknown'};})};}),unknowns:list(d.unknowns).filter(v=>typeof v==='string').slice(0,30).map(v=>str(v,500)),assets:[]};
}
