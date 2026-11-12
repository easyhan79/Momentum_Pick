import type {ListingBundle,Quantity} from './listing-bundle.ts';
import type {ProfileField} from './property-profile.ts';
// Candidate values stay private and unapproved. Existing fields and prices are
// left to the caller; this function cannot overwrite a profile or publish it.
export function candidateAsPrivateFields(bundle:ListingBundle,existingFieldIds:readonly string[]):ProfileField[] {
 const measurements:Array<{quantity:Quantity;label:string}> = [];
 for(const [i,parcel] of bundle.parcels.entries())for(const quantity of parcel.measurements)measurements.push({quantity,label:`필지 ${i+1} ${quantity.key}`});
 for(const [i,building] of bundle.buildings.entries())for(const quantity of building.measurements)measurements.push({quantity,label:`건물 ${i+1} ${quantity.key}`});
 if(existingFieldIds.length+measurements.length>60)throw new Error('profile_field_limit');
 const used=new Set(existingFieldIds);
 return measurements.map(({quantity,label},index)=>{
  if(quantity.status==='verified')throw new Error('candidate_verification_forbidden');
  const id=`bundle-candidate-${index+1}`;if(used.has(id))throw new Error('profile_field_conflict');used.add(id);
  const sourceIds=[...new Set(quantity.sourceRefs.flatMap(ref=>ref.assetId?[ref.assetId]:[]))];
  const excerpts=quantity.sourceRefs.map(ref=>ref.excerpt).filter((s):s is string=>!!s);
  const sourceText=(excerpts.join(' / ')||quantity.rawText).slice(0,500);
  return {id,key:quantity.key,label,value:quantity.value,unit:quantity.unit==='sqm'?'㎡':quantity.unit==='pyeong'?'평':'',status:quantity.status,sourceText,sourceIds,useApproved:false,publication:'private'};
 });
}
