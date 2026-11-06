import {useEffect,useState} from 'react';
import {mediaRequest} from '../lib/adminApi';import type {Showroom} from '../types/showroom';
import {ImagePromptPanel} from './ImagePromptPanel';
export function ImageSettingsEditor({content,busy,onChange}:{content:Showroom;busy:boolean;onChange:(value:Showroom)=>void}){
 const [assets,setAssets]=useState<{id:string;kind:string;source_type:string;caption:string}[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void mediaRequest(`action=list&propertyId=${content.id}`).then(r=>r.json()).then(data=>{if(active)setAssets(data.assets);}).catch(()=>{if(active)setError('자료 목록을 불러오지 못했습니다. 초안을 다시 열어 주세요.');});return()=>{active=false;};},[content.id]);
 const settings=content.imageSettings;
 return <section id="image-settings" className="glass admin-editor"><h2>AI 이미지 표현 방식</h2><p>실제 자료와 AI 예상 이미지를 구분합니다. 방식이나 근거를 변경해 저장하면 기존 생성 이미지는 초안에서 제외되며, 다시 제작할 때 남은 예산을 사용합니다.</p>
  {!settings?<button type="button" className="button button-outline" disabled={busy} onClick={()=>onChange({...content,imageSettings:{mode:'concept',sourceAssetId:null,rightsApproved:false}})}>이미지 생성 방식 설정</button>:<fieldset disabled={busy}>
   <label>이미지 유형<select aria-label="이미지 유형" value={settings.mode} onChange={e=>onChange({...content,imageSettings:{mode:e.target.value as typeof settings.mode,sourceAssetId:null,rightsApproved:false}})}><option value="concept">A · 개념형 활용 이미지</option><option value="plan">B · 도면 기반 활용 예상도</option><option value="photo">C · 현장 사진 기반 미래 예상도</option></select></label>
   {settings.mode!=='concept'&&<><label>참고할 실제 자료<select aria-label="참고할 실제 자료" value={settings.sourceAssetId||''} onChange={e=>onChange({...content,imageSettings:{...settings,sourceAssetId:e.target.value||null,rightsApproved:false}})}><option value="">자료 선택 필요</option>{assets.filter(a=>a.source_type!=='ai_generated'&&a.kind===(settings.mode==='plan'?'provided_plan':'photo')).map(a=><option key={a.id} value={a.id}>{a.caption||a.id}</option>)}</select></label><label><input type="checkbox" checked={settings.rightsApproved} onChange={e=>onChange({...content,imageSettings:{...settings,rightsApproved:e.target.checked}})}/>선택 자료를 AI 제작에 사용할 권한을 확인했습니다.</label></>}
   <p>실제 구조·출입구·기둥·카메라 구도의 보존은 자동 보장되지 않습니다. 공개 전 원자료와 결과를 사람이 대조해야 합니다.</p>
  </fieldset>}{error&&<p role="alert">{error}</p>}
  <ImagePromptPanel key={content.id} content={content} assets={assets} busy={busy}/>
 </section>;
}
