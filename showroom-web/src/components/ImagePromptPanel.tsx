import {useMemo,useState} from 'react';
import type {Showroom} from '../types/showroom';
import {buildImagePrompt,type PromptAsset,type ImagePromptTask} from '../../../supabase/functions/_shared/image-prompts.ts';
export function ImagePromptPanel({content,assets,busy}:{content:Showroom;assets:PromptAsset[];busy:boolean}){
 const [selected,setSelected]=useState('hero'),[task,setTask]=useState<ImagePromptTask>('create'),[direction,setDirection]=useState(''),[message,setMessage]=useState('');
 const slot=selected==='hero'||content.concepts.slice(0,3).some(c=>c.id===selected)?selected:'hero';
 const bundle=useMemo(()=>buildImagePrompt(content,assets,slot,task,direction),[content,assets,slot,task,direction]);
 const exported=()=>`SpacePick · Gemini 웹용 이미지 프롬프트\n${bundle.label} / ${bundle.modeLabel}\n현재 관리자 편집 화면 기준 · 실제 이미지 생성/저장/게시 전\n\n${bundle.prompt}\n\n[검토실 확인사항]\n${bundle.warnings.join('\n')}`;
 async function copy(){try{await navigator.clipboard.writeText(bundle.prompt);setMessage('프롬프트를 복사했습니다. 필요한 원본 자료를 Gemini에 첨부한 뒤 붙여넣으세요.');}catch{setMessage('복사하지 못했습니다. 아래 프롬프트를 직접 선택하거나 파일로 내려받아 주세요.');}}
 function download(){const url=URL.createObjectURL(new Blob([exported()],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`spacepick-${slot}-${task}-image-prompt.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('프롬프트를 텍스트 파일로 내려받았습니다.');}
 return <section className="image-prompt-panel" id="image-prompt-panel"><h3>Gemini 웹용 이미지 프롬프트</h3><p>대표 이미지와 활용 콘셉트에 맞춰 생성·수정 요청문을 준비합니다. 프롬프트 준비·복사는 이미지 생성 비용을 사용하지 않습니다.</p>
 <fieldset disabled={busy}><legend>프롬프트 구성</legend><label>이미지 대상<select aria-label="이미지 프롬프트 대상" value={slot} onChange={e=>{setSelected(e.target.value);setMessage('');}}><option value="hero">대표 이미지</option>{content.concepts.slice(0,3).map(c=><option key={c.id} value={c.id}>{c.conceptName||'활용 콘셉트'}</option>)}</select></label><label>작업 방식<select aria-label="이미지 프롬프트 작업 방식" value={task} onChange={e=>{setTask(e.target.value as ImagePromptTask);setMessage('');}}><option value="create">새 이미지 생성</option><option value="edit">기존 AI 이미지 수정</option></select></label><label>원하는 이미지 변경 · 선택<textarea maxLength={1000} value={direction} placeholder="예: 건물 구조와 도로는 유지하고 외벽 색감만 차분한 회색으로 바꿔 주세요." onChange={e=>{setDirection(e.target.value);setMessage('');}}/></label></fieldset>
 <p>이미지 표현 방식: {bundle.modeLabel}. 위에서 선택한 사진·도면과 사용 권한을 따릅니다. 현재 편집값을 반영하며, 초안 저장·이미지 생성·게시는 별도입니다.</p>
 {!!bundle.attachments.length&&<div><strong>Gemini에 함께 첨부할 자료</strong><ul>{bundle.attachments.map(a=><li key={a}>{a}</li>)}</ul></div>}
 {!bundle.ready&&<p role="status">{bundle.reason}</p>}
 <label>이미지 생성·수정 프롬프트<textarea aria-label="Gemini 웹용 완성 프롬프트" readOnly rows={14} value={bundle.prompt} placeholder="이미지 대상과 참고 자료·사용 권한을 확인하면 프롬프트가 표시됩니다."/></label>
 <div className="admin-toolbar"><button type="button" className="button button-gold" disabled={busy||!bundle.ready} onClick={()=>void copy()}>이미지 프롬프트 복사</button><button type="button" className="button button-outline" disabled={busy||!bundle.ready} onClick={download}>이미지 프롬프트 내려받기</button></div>
 {bundle.warnings.map(w=><p key={w}>{w}</p>)}{message&&<p role="status">{message}</p>}</section>;
}
