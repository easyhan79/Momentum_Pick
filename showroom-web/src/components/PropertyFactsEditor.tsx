import {DecisionSettingsEditor} from './DecisionSettingsEditor';
import {propertyFieldTemplates,isNumericFactKey} from '../lib/propertyFields';
import {PropertyHighlightsEditor} from './PropertyHighlightsEditor';
import {RentalScenarioEditor} from './RentalScenarioEditor';
import {useEffect,useState} from 'react';
import type {PropertyProfile,ProfileField} from '../../../supabase/functions/_shared/property-profile.ts';
import {publishCoreFacts} from '../../../supabase/functions/_shared/property-profile.ts';
import type {Showroom} from '../types/showroom';
import {mediaRequest} from '../lib/adminApi';

const emptyField=(key='other',label='추가 정보',unit=''):ProfileField=>({id:crypto.randomUUID(),key,label,unit,value:null,status:'unknown',sourceText:'',sourceIds:[],useApproved:false,publication:'private'});
export function PropertyFactsEditor({propertyId,content,busy,onChange}:{propertyId:string;content:Showroom;busy:boolean;onChange:(content:Showroom)=>void}){
  const [newFieldKey,setNewFieldKey]=useState('other');
  const [valueTypes,setValueTypes]=useState<Record<string,string>>({});
  const valueType=(f:ProfileField)=>valueTypes[f.id]||(typeof f.value==='number'||f.value===null&&isNumericFactKey(f.key)?'number':'text');
  const [assets,setAssets]=useState<{id:string;caption:string;source_type:string}[]>([]),[error,setError]=useState('');
  const profile=content.propertyProfile;
  const templates=propertyFieldTemplates(profile?.kind==='unknown'?content.category:profile?.kind||content.category);
  useEffect(()=>{let active=true;setAssets([]);setError('');void mediaRequest(`action=list&propertyId=${propertyId}`).then(r=>r.json()).then(data=>{if(active)setAssets(data.assets||[]);}).catch(()=>{if(active)setError('근거자료 목록을 불러오지 못했습니다. 초안을 다시 열어 확인해 주세요.');});return()=>{active=false;};},[propertyId]);
  function update(next:PropertyProfile){
    const changed=profile&&JSON.stringify([profile.kind,profile.price,profile.fields,profile.sourcePermissions,profile.modules?.rentalScenario])!==JSON.stringify([next.kind,next.price,next.fields,next.sourcePermissions,next.modules?.rentalScenario]);
    if(changed&&next.modules?.customerDecision){const decision={...next.modules.customerDecision,reviewConfirmed:false};delete decision.reviewedBy;delete decision.reviewedAt;next={...next,modules:{...next.modules,customerDecision:decision}};}
    onChange({...content,propertyProfile:{...next,sourcePermissions:next.sourcePermissions.filter(permission=>next.fields.some(field=>field.sourceIds.includes(permission.assetId)))}});
  }
  function editField(id:string,patch:Partial<ProfileField>,confirmation=false){if(!profile)return;update({...profile,fields:profile.fields.map(f=>f.id!==id?f:{...f,...patch,...(!confirmation&&f.verification?{verification:{...(patch.verification||f.verification),confirmed:false,by:undefined,at:undefined}}:{})})});}
  function start(){
    const fields:ProfileField[]=content.facts.map(f=>({...emptyField(f.key,f.label,f.unit||''),value:f.value,status:f.evidence==='owner_provided'?'provided':f.evidence==='ai_hypothesis'?'inferred':'unknown',sourceText:f.source}));
    for(const [key,label,unit] of templates)if(!fields.some(f=>f.key===key))fields.push(emptyField(key,label,unit));
    update({version:1,kind:content.category==='commercial'?'commercial':content.category==='land'?'land':content.category==='income'?'income':'unknown',transaction:'unknown',price:{status:'unknown',saleWon:null,depositWon:null,monthlyWon:null},fields,sourcePermissions:[],highlights:[]});
  }
  return <section id="property-facts-editor" className="glass admin-editor"><h2>매물 사실정보와 출처</h2>
    {!profile?<><p>기본정보와 공장·산업용 조건을 편집합니다. 기존 정보를 가져오되 공개 권한과 검증 상태는 다시 확인합니다. 기존 승인본은 재승인 전까지 유지됩니다.</p><button type="button" className="button button-outline" disabled={busy} onClick={start}>사실정보 편집 시작</button></>:<>
      <p>공개할 값은 출처와 사용 권한을 확인하세요. 비공개 정보도 초안에는 보관할 수 있습니다. 수정 후 상단 「초안 저장」을 눌러 주세요.</p>
      <fieldset disabled={busy}><legend>매물 구분과 거래조건</legend>
        <label>세부 유형<select aria-label="세부 유형" value={profile.kind} onChange={e=>update({...profile,kind:e.target.value as PropertyProfile['kind']})}><option value="unknown">확인 필요</option><option value="factory">공장</option><option value="logistics">물류센터</option><option value="commercial">상가</option><option value="land">토지</option><option value="income">건물 전체</option></select></label>
        <label>거래방식<select aria-label="거래방식" value={profile.transaction} onChange={e=>update({...profile,transaction:e.target.value as PropertyProfile['transaction']})}><option value="unknown">확인 필요</option><option value="sale">매매</option><option value="lease">임대</option></select></label>
        <label>소재지<input maxLength={300} value={content.address||''} onChange={e=>onChange({...content,address:e.target.value})}/></label>
        <label>가격 상태<select aria-label="가격 상태" value={profile.price.status} onChange={e=>update({...profile,price:{...profile.price,status:e.target.value as PropertyProfile['price']['status']}})}><option value="unknown">확인 필요</option><option value="negotiable">가격 협의</option><option value="fixed">금액 입력</option></select></label>
        {profile.price.status==='fixed'&&(profile.transaction==='sale'?[['saleWon','매매가격']]:profile.transaction==='lease'?[['depositWon','보증금'],['monthlyWon','월세']]:[]).map(([key,label])=><label key={key}>{label} · 원<input type="number" min="0" step="1" value={profile.price[key as 'saleWon']??''} onChange={e=>update({...profile,price:{...profile.price,[key]:e.target.value===''?null:Number(e.target.value)}})}/></label>)}
      </fieldset>
      {content.registration&&<fieldset disabled={busy}><legend>담당자와 입력자료 사용 권한</legend>
        <label>담당자 이름<input maxLength={100} value={content.registration.contact.name} onChange={e=>onChange({...content,registration:{...content.registration!,contact:{...content.registration!.contact,name:e.target.value}}})}/></label>
        <label>업무용 연락처<input type="tel" maxLength={50} value={content.registration.contact.phone} onChange={e=>onChange({...content,registration:{...content.registration!,contact:{...content.registration!.contact,phone:e.target.value}}})}/></label>
        <label><input type="checkbox" checked={content.registration.contact.publicApproved} onChange={e=>onChange({...content,registration:{...content.registration!,contact:{...content.registration!.contact,publicApproved:e.target.checked}}})}/>담당자 정보의 고객 공개에 동의합니다.</label>
        <label><input type="checkbox" checked={content.registration.rightsApproved} onChange={e=>onChange({...content,registration:{...content.registration!,rightsApproved:e.target.checked},...(e.target.checked&&profile?{propertyProfile:publishCoreFacts(profile)}:{})})}/>입력 정보와 자료의 사용 권한을 확인했습니다.</label><small className="facts-default-public">확인하면 입력한 주소·거래조건·가격·면적은 기본으로 공개됩니다. 숨길 항목만 아래에서 비공개로 바꾸세요.</small>
      </fieldset>}
      <h3>사실정보</h3>
      {profile.fields.map((field,index)=><fieldset key={field.id} disabled={busy} className="fact-editor-field"><legend>{index+1}. {field.label}</legend>
        <div className="fact-editor-grid"><label>항목명<input maxLength={100} value={field.label} onChange={e=>editField(field.id,{label:e.target.value})}/></label>
          <label>값 형식<select aria-label="값 형식" value={valueType(field)} onChange={e=>{setValueTypes(current=>({...current,[field.id]:e.target.value}));editField(field.id,{value:null});}}><option value="text">문자</option><option value="number">숫자</option></select></label>
          <label>값<input type={valueType(field)==='number'?'number':'text'} step="any" maxLength={2000} value={field.value??''} onChange={e=>{const raw=e.target.value;editField(field.id,{value:raw.trim()===''?null:valueType(field)==='number'?Number(raw):raw});}}/></label>
          <label>단위<input maxLength={30} value={field.unit} onChange={e=>editField(field.id,{unit:e.target.value})}/></label></div>
        <label>정보 상태<select aria-label="정보 상태" value={field.status} onChange={e=>editField(field.id,{status:e.target.value as ProfileField['status']})}><option value="unknown">확인 필요</option><option value="provided">제공정보 · 미검증</option><option value="verified">증빙 대조 완료</option><option value="inferred">자료 기반 추론</option><option value="generated">AI 생성</option></select></label>
        <label>정보 기준일 · 선택<input type="date" value={field.asOf||''} onChange={e=>editField(field.id,{asOf:e.target.value})}/></label>
        <label>공개할 출처 설명 · 개인정보 제외<input maxLength={500} value={field.sourceText} onChange={e=>editField(field.id,{sourceText:e.target.value})}/></label>
        <label>근거자료 · 여러 개 선택 가능<select aria-label="근거자료 · 여러 개 선택 가능" multiple value={field.sourceIds} onChange={e=>editField(field.id,{sourceIds:Array.from(e.target.selectedOptions,option=>option.value)})}>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.caption||asset.id}{asset.source_type==='ai_generated'?' (AI 생성)':''}</option>)}</select></label>
        <button type="button" className="button button-outline" disabled={!field.sourceIds.length} onClick={()=>editField(field.id,{sourceIds:[]})}>근거 연결 해제</button>
        {field.status==='verified'&&<><label>증빙 대조 방법·확인 메모<textarea maxLength={2000} value={field.verification?.method||''} onChange={e=>editField(field.id,{verification:{method:e.target.value,confirmed:false}})}/></label><label><input type="checkbox" checked={!!field.verification?.by||field.verification?.confirmed===true} onChange={e=>editField(field.id,{verification:{method:field.verification?.method||'',confirmed:e.target.checked}},true)}/>연결된 실제 증빙과 값을 대조했습니다. 확인자는 저장 시 기록됩니다.</label></>}
        <label><input type="checkbox" checked={field.useApproved} onChange={e=>editField(field.id,{useApproved:e.target.checked})}/>이 정보와 근거자료를 사용할 권한을 확인했습니다.</label>
        <label>값 공개 범위<select aria-label="값 공개 범위" value={field.publication} onChange={e=>editField(field.id,{publication:e.target.value as ProfileField['publication']})}><option value="private">비공개 · 초안 보관</option><option value="approved">승인 후 고객 공개</option></select></label>
        <button type="button" className="button button-outline" onClick={()=>update({...profile,fields:profile.fields.filter(f=>f.id!==field.id),highlights:profile.highlights.filter(h=>!h.fieldIds.includes(field.id))})}>이 항목 삭제</button>
      </fieldset>)}
      <label>추가할 정보 항목<select aria-label="추가할 정보 항목" disabled={busy} value={newFieldKey} onChange={e=>setNewFieldKey(e.target.value)}><option value="other">직접 입력</option>{templates.map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><button type="button" className="button button-outline" disabled={busy||profile.fields.length>=60} onClick={()=>{const t=templates.find(([key])=>key===newFieldKey);update({...profile,fields:[...profile.fields,t?emptyField(t[0],t[1],t[2]):emptyField()]});}}>정보 항목 추가</button>
      <h3>연결 자료의 사용·정보 공개 범위</h3><p>아래 확인은 자료에서 가져온 정보의 공개 범위입니다. 원본 파일이 자동 공개되지는 않습니다.</p>
      {error&&<p role="alert">{error}</p>}
      {assets.filter(asset=>profile.fields.some(f=>f.sourceIds.includes(asset.id))).map(asset=>{
        const permission=profile.sourcePermissions.find(s=>s.assetId===asset.id)||{assetId:asset.id,useApproved:false,allowDerivedPublication:false};
        const change=(patch:Partial<typeof permission>)=>update({...profile,sourcePermissions:[...profile.sourcePermissions.filter(s=>s.assetId!==asset.id),{...permission,...patch}]});
        return <fieldset disabled={busy} key={asset.id}><legend>{asset.caption||asset.id}</legend><label><input type="checkbox" checked={permission.useApproved} onChange={e=>change({useApproved:e.target.checked})}/>자료 사용 권한 확인</label><label><input type="checkbox" checked={permission.allowDerivedPublication} onChange={e=>change({allowDerivedPublication:e.target.checked})}/>자료에서 가져온 정보의 공개 허용 확인</label></fieldset>;
      })}
      <DecisionSettingsEditor profile={profile} busy={busy} onChange={update}/>
      <PropertyHighlightsEditor profile={profile} busy={busy} onChange={update}/>
      <RentalScenarioEditor value={profile.modules?.rentalScenario} busy={busy} onChange={rentalScenario=>update({...profile,modules:{...profile.modules,rentalScenario}})}/>
    </>}
  </section>;
}
