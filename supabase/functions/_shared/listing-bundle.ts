// Private candidate contract for a multi-parcel listing. This module does not
// publish data or elevate extracted claims to verified facts.
export type MeasurementKey = 'land_area'|'building_area'|'gross_floor_area'|'exclusive_area'|'contract_area'|'warehouse_area';
export type SourceRef = {kind:'input_text'|'pdf'|'photo'|'plan'|'editor'; inputVersionId?:string; assetId?:string; page?:number; excerpt?:string;editedBy?:string;editedAt?:string;editRevision?:number};
export type Quantity = {key:MeasurementKey; rawText:string; value:number|null; unit:'sqm'|'pyeong'|'unknown'; normalizedSqm:number|null; status:'provided'|'verified'|'inferred'|'unknown'; sourceRefs:SourceRef[]};
export type Parcel = {id:string; addressText:string; parcelNumber?:string; measurements:Quantity[]; sourceRefs:SourceRef[]};
export type Building = {id:string; name?:string; parcelIds:string[]; measurements:Quantity[]; sourceRefs:SourceRef[]};
export type PriceClaim = {scope:'listing'|'parcel'|'building'; targetIds:string[]; rawText:string; amountWon:number|null; sourceRefs:SourceRef[]};
export type ConflictCandidate = {value:string|number|null;sourceRefs:SourceRef[]};
export type ListingBundle = {schemaVersion:2; parcels:Parcel[]; buildings:Building[]; saleScope:'bundle'|'individual'|'negotiable'|'unknown'; priceClaims:PriceClaim[]; conflicts:Array<{fieldPath:string;candidates:ConflictCandidate[]}>};

const PYEONG_SQM = 3.305785;
const keys = ['land_area','building_area','gross_floor_area','exclusive_area','contract_area','warehouse_area'] as const;
const fail = ():never => {throw new Error('invalid_listing_bundle');};
const obj = (v:unknown):Record<string,unknown> => v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : fail();
const arr = (v:unknown,max:number):unknown[] => Array.isArray(v)&&v.length<=max?v:fail();
const str = (v:unknown,max:number,required=false):string => typeof v==='string'&&v.length<=max&&(!required||!!v.trim())?v:fail();
function one<T extends string>(v:unknown,values:readonly T[]):T {return values.includes(v as T)?v as T:fail();}
function id(v:unknown):string {const value=str(v,100,true);return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)?value:fail();}
function unique(values:string[]):string[] {return new Set(values).size===values.length?values:fail();}
export type SourceContext = {inputVersionId:string; inputVersionIds?:readonly string[]; assetIds:readonly string[];allowedEditorRefs?:readonly SourceRef[]};
export function validateSourceRefs(value:unknown,context:SourceContext):SourceRef[] {
 return arr(value,10).map(item=>{const r=obj(item),kind=one(r.kind,['input_text','pdf','photo','plan','editor'] as const);const result:SourceRef={kind};
  if(kind==='editor'){const found=context.allowedEditorRefs?.find(ref=>ref.kind==='editor'&&ref.editedBy===r.editedBy&&ref.editedAt===r.editedAt&&ref.editRevision===r.editRevision);if(!found||r.inputVersionId!==undefined||r.assetId!==undefined||r.page!==undefined||r.excerpt!==undefined)fail();return {...found!};}
  if(kind==='input_text'){const version=str(r.inputVersionId,200,true);if(!(context.inputVersionIds||[context.inputVersionId]).includes(version)||r.assetId!==undefined||r.page!==undefined)fail();result.inputVersionId=version;}
  else {const assetId=str(r.assetId,100,true);if(!context.assetIds.includes(assetId)||r.inputVersionId!==undefined)fail();result.assetId=assetId;if(r.page!==undefined){if(kind!=='pdf'||!Number.isSafeInteger(r.page)||Number(r.page)<1)fail();result.page=Number(r.page);}}
  if(r.excerpt!==undefined)result.excerpt=str(r.excerpt,2000);return result;
 });
}
function quantities(value:unknown,context:SourceContext):Quantity[] {
 return arr(value,60).map(item=>{const q=obj(item),value=q.value;if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<=0))fail();
  const unit=one(q.unit,['sqm','pyeong','unknown'] as const),status=one(q.status,['provided','inferred','unknown'] as const),sourceRefs=validateSourceRefs(q.sourceRefs,context);
  if((value===null)!==(status==='unknown')||(value!==null&&!sourceRefs.length))fail();
  // Always calculate the normalized value; never trust a supplied conversion.
  const normalizedSqm=value===null||unit==='unknown'?null:unit==='sqm'?value as number:(value as number)*PYEONG_SQM;
  return {key:one(q.key,keys),rawText:str(q.rawText,500,true),value:value as number|null,unit,normalizedSqm,status,sourceRefs};
 });
}
export function validateListingCandidate(input:unknown,context:SourceContext):ListingBundle {
 const v=obj(input);if(v.schemaVersion!==2||!context.inputVersionId)fail();
 const parcels=arr(v.parcels,60).map(item=>{const p=obj(item);return {id:id(p.id),addressText:str(p.addressText,300),...(p.parcelNumber===undefined?{}:{parcelNumber:str(p.parcelNumber,100)}),measurements:quantities(p.measurements,context),sourceRefs:validateSourceRefs(p.sourceRefs,context)};});
 const parcelIds=unique(parcels.map(p=>p.id));
 const buildings=arr(v.buildings,60).map(item=>{const b=obj(item),linked=unique(arr(b.parcelIds,60).map(id));if(linked.some(x=>!parcelIds.includes(x)))fail();return {id:id(b.id),...(b.name===undefined?{}:{name:str(b.name,200)}),parcelIds:linked,measurements:quantities(b.measurements,context),sourceRefs:validateSourceRefs(b.sourceRefs,context)};});
 const buildingIds=unique(buildings.map(b=>b.id));
 if(parcels.reduce((n,p)=>n+p.measurements.length,0)+buildings.reduce((n,b)=>n+b.measurements.length,0)>60)fail();
 const priceClaims=arr(v.priceClaims,60).map(item=>{const p=obj(item),scope=one(p.scope,['listing','parcel','building'] as const),targetIds=unique(arr(p.targetIds,60).map(id)),amountWon=p.amountWon,sourceRefs=validateSourceRefs(p.sourceRefs,context);
  if(scope==='listing'?targetIds.length!==0:!targetIds.length||targetIds.some(x=>!(scope==='parcel'?parcelIds:buildingIds).includes(x)))fail();
  if(amountWon!==null&&(!Number.isSafeInteger(amountWon)||Number(amountWon)<0))fail();if(amountWon!==null&&!sourceRefs.length)fail();
  return {scope,targetIds,rawText:str(p.rawText,500,true),amountWon:amountWon as number|null,sourceRefs};});
 const conflicts=arr(v.conflicts,60).map(item=>{const c=obj(item),candidates=arr(c.candidates,20).map(item=>{const candidate=obj(item),value=candidate.value,sourceRefs=validateSourceRefs(candidate.sourceRefs,context);if(value!==null&&!(typeof value==='string'&&value.length<=2000)&&!(typeof value==='number'&&Number.isFinite(value)))fail();if(!sourceRefs.length)fail();return {value:value as string|number|null,sourceRefs};});if(candidates.length<2)fail();return {fieldPath:str(c.fieldPath,500,true),candidates};});
 return {schemaVersion:2,parcels,buildings,saleScope:one(v.saleScope,['bundle','individual','negotiable','unknown'] as const),priceClaims,conflicts};
}
