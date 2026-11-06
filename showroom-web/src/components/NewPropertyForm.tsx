import {useRef,useState} from 'react';
import {api} from '../lib/adminApi';
import type {Showroom} from '../types/showroom';
type Draft={id:string;property_id:string;revision:number;slug:string;showroom_status:string;draft_content:Showroom};
export function NewPropertyForm({onCreated}:{onCreated:(draft:Draft)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(crypto.randomUUID());
 async function submit(form:HTMLFormElement){
  const data=new FormData(form),number=(name:string)=>{const value=String(data.get(name)||'').trim();return value?Number(value):null;};
  const input={title:String(data.get('title')||''),address:String(data.get('address')||''),summary:String(data.get('summary')||''),kind:data.get('kind'),transaction:data.get('transaction'),area:number('area'),areaKey:data.get('areaKey'),price:{status:data.get('priceStatus'),saleWon:number('saleWon'),depositWon:number('depositWon'),monthlyWon:number('monthlyWon')},rightsConfirmed:data.get('rights')==='on',contact:{name:String(data.get('contactName')||''),phone:String(data.get('contactPhone')||''),publicApproved:data.get('contactPublic')==='on'}};
  setBusy(true);setError('');try{const result=await api<{showroom:Draft}>('','POST',{action:'create-property',requestId:request.current,input});onCreated(result.showroom);request.current=crypto.randomUUID();setOpen(false);form.reset();}catch(e){setError(e instanceof Error?e.message:'등록하지 못했습니다. 입력 내용을 유지한 채 다시 시도해 주세요.');}finally{setBusy(false);}
 }
 return <section className="glass admin-editor" id="new-property"><h2>새 매물 등록</h2><p>자료가 부족해도 비공개로 임시 저장할 수 있습니다. 사진·도면은 저장 후 선택적으로 첨부하세요.</p>
  <button type="button" className="button button-outline" disabled={busy} onClick={()=>setOpen(!open)}>{open?'등록 양식 닫기':'새 매물 입력'}</button>
  {open&&<form onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}}><fieldset disabled={busy}>
    <label>매물 유형<select name="kind" aria-label="매물 유형"><option value="unknown">확인 필요</option><option value="factory">공장</option><option value="commercial">상가</option><option value="logistics">물류센터</option><option value="land">토지</option><option value="income">건물 전체</option></select></label>
    <label>거래방식<select name="transaction" aria-label="등록 거래방식"><option value="unknown">확인 필요</option><option value="sale">매매</option><option value="lease">임대</option></select></label>
    <label>매물명<input name="title" maxLength={200}/></label><label>소재지<input name="address" maxLength={300}/></label>
    <label>면적 종류<select name="areaKey" aria-label="면적 종류"><option value="land_area">토지면적</option><option value="building_area">건축면적</option><option value="gross_floor_area">연면적</option><option value="exclusive_area">전용면적</option><option value="contract_area">계약·공급면적</option><option value="warehouse_area">창고면적</option></select></label><label>확인 가능한 면적 · ㎡<input type="number" min="0.01" step="any" name="area"/></label>
    <label>가격 상태<select name="priceStatus" aria-label="등록 가격 상태"><option value="unknown">확인 필요</option><option value="negotiable">가격 협의</option><option value="fixed">금액 입력</option></select></label>
    <div className="fact-editor-grid"><label>매매가격 · 원<input type="number" min="0" step="1" name="saleWon"/></label><label>임대보증금 · 원<input type="number" min="0" step="1" name="depositWon"/></label><label>월세 · 원<input type="number" min="0" step="1" name="monthlyWon"/></label></div>
    <label>매물 설명 · 선택<textarea name="summary" maxLength={4000}/></label>
    <label>담당자 이름<input name="contactName" maxLength={100}/></label><label>업무용 연락처<input name="contactPhone" type="tel" maxLength={50}/></label>
    <label><input name="contactPublic" type="checkbox"/>이 담당자 정보의 고객 공개에 동의합니다. 공개 전 필수입니다.</label>
    <label><input name="rights" type="checkbox"/>입력 정보와 자료를 사용할 권한을 확인했습니다. AI 분석 전 필수입니다.</label>
    <button className="button button-gold">{busy?'저장 중…':'비공개 임시 저장'}</button>
  </fieldset></form>}{error&&<p role="alert">{error}</p>}
 </section>;
}
