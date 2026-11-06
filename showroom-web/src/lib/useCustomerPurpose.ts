import {useEffect,useState} from 'react';
import {selectedPurpose,type DecisionKind} from '../../../supabase/functions/_shared/customer-purpose.ts';
export function useCustomerPurpose(propertyId:string,kind:DecisionKind,options?:{id:string;label:string}[]){
 const allowed=(id:string)=>!options||options.some(p=>p.id===id);
 const optionsKey=options?.map(p=>p.id).join('|')||'';
 const read=()=>typeof window==='undefined'?'':selectedPurpose(kind,new URLSearchParams(window.location.search).get('purpose')||'')?.id||'';
 const readAllowed=()=>{const id=read();return allowed(id)?id:'';};
 const [purposeId,setPurposeId]=useState(readAllowed);
 useEffect(()=>{const change=()=>setPurposeId(readAllowed());change();window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[propertyId,kind,optionsKey]);
 const choose=(id:string)=>{const safe=allowed(id)?selectedPurpose(kind,id)?.id||'':'';setPurposeId(safe);const url=new URL(window.location.href);if(safe)url.searchParams.set('purpose',safe);else url.searchParams.delete('purpose');window.history.replaceState(null,'',url.pathname+url.search+url.hash);};
 return {purposeId,choose,purpose:selectedPurpose(kind,purposeId)};
}
