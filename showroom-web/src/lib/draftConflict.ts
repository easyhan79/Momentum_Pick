import type {Showroom} from '../types/showroom';

// Draft fields that the admin page sends with save-draft.
export const editableDraftKeys=['title','subtitle','summary','concepts','imageSettings','propertyProfile','address','registration','brief'] as const;

// After a revision conflict, keep the latest server draft and re-apply only the
// fields the admin changed since the draft they started editing (base).
export function reapplyEdits(base:Showroom|undefined,mine:Showroom,latest:Showroom):Showroom{
  const before=(base||{}) as unknown as Record<string,unknown>;
  const edited=mine as unknown as Record<string,unknown>;
  const merged={...latest} as unknown as Record<string,unknown>;
  for(const key of editableDraftKeys){
    if(JSON.stringify(edited[key])!==JSON.stringify(before[key]))merged[key]=edited[key];
  }
  return merged as unknown as Showroom;
}
