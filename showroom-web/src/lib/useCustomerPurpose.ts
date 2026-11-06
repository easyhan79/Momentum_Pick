import {useEffect,useState} from 'react';
import {selectedPurpose,type DecisionKind} from '../../../supabase/functions/_shared/customer-purpose.ts';
export function useCustomerPurpose(propertyId:string,kind:DecisionKind){
 const read=()=>typeof window==='undefined'?'':selectedPurpose(kind,new URLSearchParams(window.location.search).get('purpose')||'')?.id||'';
 const [purposeId,setPurposeId]=useState(read);
 useEffect(()=>{const change=()=>setPurposeId(read());change();window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[propertyId,kind]);
 const choose=(id:string)=>{const safe=selectedPurpose(kind,id)?.id||'';setPurposeId(safe);const url=new URL(window.location.href);if(safe)url.searchParams.set('purpose',safe);else url.searchParams.delete('purpose');window.history.replaceState(null,'',url.pathname+url.search+url.hash);};
 return {purposeId,choose,purpose:selectedPurpose(kind,purposeId)};
}
