import type {Showroom} from '../types/showroom';
export type IntakeRoom={id:string;property_id:string;revision:number;slug:string;showroom_status:string;draft_content:Showroom};
export type IntakeResult={showroom:IntakeRoom;receipt:{propertyId:string;requestId:string;number:string;createdAt:string;sourceUpdatedAt:string|null;sourceRevision:number;mode:'simple'|'materials';providedText:string|null;sourceAvailable:boolean;formClosed:boolean};replayed?:boolean;appliedRevision?:number};
export type IntakeInput={mode:'simple'|'materials';providedText:string;summary:string;title:string;address:string;kind:string;transaction:string;area:number|null;areaKey:string;price:{status:string;saleWon:number|null;depositWon:number|null;monthlyWon:number|null};rightsConfirmed:boolean;contact:{name:string;phone:string;publicApproved:boolean}};
export const pendingIntakeKey='spacepick-pending-intake-v1';
export function initialIntake(mode:'simple'|'materials'='simple'):IntakeInput{return {mode,providedText:'',summary:'',title:'',address:'',kind:'unknown',transaction:'unknown',area:null,areaKey:'land_area',price:{status:'unknown',saleWon:null,depositWon:null,monthlyWon:null},rightsConfirmed:false,contact:{name:'',phone:'',publicApproved:false}};}
export function restoredInput(value:IntakeResult):IntakeInput{
 const d=value.showroom.draft_content,p=d.propertyProfile,area=p?.fields.find(f=>f.id==='initial-area');
 return {...initialIntake(value.receipt.mode),providedText:value.receipt.providedText||'',title:d.title==='매물 검토 초안'?'':d.title,address:d.address||'',kind:p?.kind||'unknown',transaction:p?.transaction||'unknown',area:typeof area?.value==='number'?area.value:null,areaKey:area?.key||'land_area',price:p?{...p.price}:initialIntake().price,rightsConfirmed:d.registration?.rightsApproved===true,contact:d.registration?.contact?{...d.registration.contact}:initialIntake().contact};
}
export function pendingRequest(){try{const id=sessionStorage.getItem(pendingIntakeKey);return id&&/^[0-9a-f-]{36}$/i.test(id)?id:null;}catch{return null;}}
export function rememberRequest(value:string|null){try{if(value)sessionStorage.setItem(pendingIntakeKey,value);else sessionStorage.removeItem(pendingIntakeKey);}catch{/* Server receipt remains authoritative. */}}
