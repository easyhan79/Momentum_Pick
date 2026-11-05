import {ProfileError,type ProfileField,type PropertyProfile} from './property-profile.ts';
type Json=Record<string,any>;
export const sourceCheckLabels={not_checked:'원문 자동 대조 전',quote_matched:'원문 문구 일치 · 내용은 미검증',quote_not_found:'해당 페이지에서 인용문을 찾지 못함',page_out_of_range:'PDF 페이지 번호 불일치',quote_missing:'원문 인용문 누락',no_extractable_text:'텍스트 없는 페이지 · 스캔/원문 확인 필요',text_limited:'PDF 텍스트 일부만 확인 가능',page_unreadable:'페이지 텍스트를 읽지 못함',value_not_in_quote:'인용문에 추출값이 없음',unit_not_in_quote:'인용문에 해당 단위가 없음'};
export type SourceCheck=keyof typeof sourceCheckLabels;
export const documentErrorLabels={document_pdf_invalid:'PDF 형식을 읽지 못했습니다. 원본 파일을 확인해 주세요.',document_pdf_encrypted:'암호화된 PDF입니다. 암호화가 해제된 사본을 사용하거나 해당 문서를 분석에서 제외해 주세요.',document_pdf_page_limit:'분석 가능한 PDF 페이지 한도를 초과했습니다. 문서나 페이지 범위를 줄여 주세요.',document_pdf_resource_limit:'PDF를 처리할 수 있는 크기·복잡도 한도를 초과했습니다.',document_pdf_timeout:'PDF 원문 확인 시간이 초과됐습니다. 파일을 나누거나 해당 문서를 제외해 주세요.',document_pdf_parser_unavailable:'PDF 확인 도구가 준비되지 않았습니다. 관리자 환경 설정을 확인해 주세요.'};
export function documentAnalysisState(value:unknown){
 const row=value as Json;
 if(!row||!['waiting','running','done','failed'].includes(row.state))return undefined;
 return {state:row.state,attempts:Number.isInteger(row.attempts)?Math.max(0,Math.min(5,row.attempts)):0,...(Object.hasOwn(documentErrorLabels,row.last_error_code)?{errorCode:row.last_error_code as keyof typeof documentErrorLabels}:{})};
}
export type DocumentCandidate={index:number;key:string;label:string;value:string;unit:string;sourceIndex:number;page:number;quote:string;missing:boolean;assetId?:string;sourceCheck?:SourceCheck;sourceSha256?:string};
const str=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export function documentCandidates(value:unknown):DocumentCandidate[]{
 return (Array.isArray(value)?value:[]).slice(0,20).flatMap((v:Json,index)=>{
   if(!v||typeof v!=='object'||!/^[a-z][a-z0-9_]{0,99}$/.test(v.key||''))return [];
   return [{index,key:v.key,label:str(v.label,100)||v.key,value:str(v.value,500),unit:str(v.unit,30),sourceIndex:Number.isInteger(v.source_index)&&v.source_index>=0&&v.source_index<=12?v.source_index:0,page:Number.isInteger(v.page)&&v.page>0&&v.page<=10000?v.page:0,quote:str(v.quote,300),missing:v.missing===true||!str(v.value,500)}];
 });
}
export async function documentVersion(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value??[]))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function candidateFingerprint(c:DocumentCandidate){return documentVersion([c.key,c.value,c.unit,c.sourceIndex,c.page,c.quote,c.missing]);}
export function documentReviewVersion(ai:Json){
 return ['_document_checks','_document_sources','_document_inspections'].some(key=>Array.isArray(ai[key])&&ai[key].length)?documentVersion({facts:ai.document_facts??[],checks:ai._document_checks??[],sources:ai._document_sources??[],documents:ai._document_inspections??[]}):documentVersion(ai.document_facts);
}
export async function checkedDocumentCandidates(ai:Json,propertyId:string){
 const checks=Array.isArray(ai._document_checks)?ai._document_checks:[];
 const sources=Array.isArray(ai._document_sources)?ai._document_sources:[];
 const inspections=Array.isArray(ai._document_inspections)?ai._document_inspections:[];
 return Promise.all(documentCandidates(ai.document_facts).map(async c=>{
   const source=sources.find((s:Json)=>s.property_id===propertyId&&s.source_index===c.sourceIndex&&/^[0-9a-f-]{36}$/i.test(s.asset_id||''));
   const inspection=inspections.find((d:Json)=>d.source_index===c.sourceIndex&&typeof d.sha256==='string');
   const fingerprint=await candidateFingerprint(c);
   const check=checks.find((check:Json)=>check.candidate_index===c.index&&check.fingerprint===fingerprint&&check.source_index===c.sourceIndex&&check.page===c.page&&inspection&&check.source_sha256===inspection.sha256);
   const sourceCheck:SourceCheck=check&&Object.hasOwn(sourceCheckLabels,check.status)?check.status:'not_checked';
   return {...c,...(source?{assetId:source.asset_id}:{}),sourceCheck,...(source&&inspection&&/^[0-9a-f]{64}$/.test(inspection.sha256)?{sourceSha256:inspection.sha256}:{})};
 }));
}
export function documentInspectionSummaries(ai:Json){
 return (Array.isArray(ai._document_inspections)?ai._document_inspections:[]).slice(0,12).flatMap((d:Json)=>{
   if(!Number.isInteger(d.source_index)||d.source_index<1||d.source_index>12||!Number.isInteger(d.page_count)||d.page_count<1||d.page_count>100)return [];
   const pages=(v:unknown)=>Array.isArray(v)?v.filter(n=>Number.isInteger(n)&&n>0&&n<=d.page_count).slice(0,100):[];
   return [{sourceIndex:d.source_index,pageCount:d.page_count,textlessPages:pages(d.textless_pages),limitedPages:pages(d.limited_pages),unreadablePages:pages(d.unreadable_pages)}];
 });
}
export function documentIssues(candidates:DocumentCandidate[]){
 const issues:{kind:'missing'|'conflict'|'source';key:string;message:string}[]=[];
 for(const key of new Set(candidates.map(c=>c.key))){
  const group=candidates.filter(c=>c.key===key);
  if(group.some(c=>c.missing))issues.push({kind:'missing',key,message:`${group[0].label}: 누락 또는 확인 필요 항목이 있습니다.`});
  const values=new Set(group.filter(c=>!c.missing).map(c=>`${c.value.replace(/\s+/g,'')}|${c.unit}`));
  if(values.size>1)issues.push({kind:'conflict',key,message:`${group[0].label}: 서로 다른 값이 추출됐습니다. 원문을 대조해 주세요.`});
 }
 for(const c of candidates)if(!c.quote||!c.page)issues.push({kind:'source',key:c.key,message:`${c.label}: 원문 인용 또는 PDF 페이지를 확인해 주세요.`});
 for(const c of candidates)if(c.sourceCheck&&c.sourceCheck!=='not_checked'&&c.sourceCheck!=='quote_matched')issues.push({kind:'source',key:c.key,message:`${c.label}: ${sourceCheckLabels[c.sourceCheck]}. 원문과 값을 직접 확인해 주세요.`});
 return issues;
}
export function importDocumentCandidates(profile:PropertyProfile,candidates:DocumentCandidate[],indices:unknown,sources:Map<number,string>=new Map()):PropertyProfile{
 if(!Array.isArray(indices)||!indices.length||indices.length>20||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)))throw new ProfileError('invalid_document_selection');
 const selected=indices.map(index=>candidates.find(c=>c.index===index));
 if(selected.some(c=>!c||c.missing))throw new ProfileError('invalid_document_selection');
 if(profile.fields.length+selected.length>60)throw new ProfileError('invalid_document_selection');
 const fields:ProfileField[]=selected.map(candidate=>{
  const c=candidate!;
  const numeric=c.value.replace(/,/g,'');
  const value=/^(land_area|building_area|gross_floor_area|exclusive_area|contract_area|warehouse_area|power_capacity|clear_height|floor_load)$/.test(c.key)&&/^\d+(\.\d+)?$/.test(numeric)?Number(numeric):c.value;
  return {id:crypto.randomUUID(),key:c.key,label:c.label,value,unit:c.unit,status:'provided',sourceText:`${c.sourceIndex?'첨부 '+c.sourceIndex:'제공 텍스트'}${c.page?' · '+c.page+'쪽':''} · AI 추출 · 원문 대조 필요`,sourceIds:sources.has(c.sourceIndex)?[sources.get(c.sourceIndex)!]:[],useApproved:false,publication:'private'};
 });
 return {...profile,fields:[...profile.fields,...fields]};
}
