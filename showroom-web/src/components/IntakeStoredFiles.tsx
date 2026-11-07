import {useEffect,useState} from 'react';import {mediaRequest} from '../lib/adminApi';
export function IntakeStoredFiles({propertyId,refresh}:{propertyId:string;refresh:number}){
 const [files,setFiles]=useState<{id:string;kind:string;caption:string;created_at?:string}[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;void mediaRequest(`action=list&propertyId=${propertyId}`).then(r=>r.json()).then(value=>{if(active){setFiles(value.assets);setError('');}}).catch(()=>{if(active)setError('보관 자료 목록을 확인하지 못했습니다. 등록 정보는 유지됩니다.');});return()=>{active=false;};},[propertyId,refresh]);
 const labels:Record<string,string>={document:'제공 PDF',provided_plan:'제공 도면',photo:'현장사진',concept:'AI 활용 이미지'};
 return <div className="intake-files"><h4>서버에 보관된 자료 {files.length}개</h4>{files.length?<ul>{files.map(file=><li key={file.id}>{labels[file.kind]||'제공 자료'} · {file.caption||'설명 없음'} · 비공개 보관 완료</li>)}</ul>:<p>아직 보관된 자료가 없습니다. 파일을 올리지 않아도 임시 저장할 수 있습니다.</p>}{error&&<p role="status">{error}</p>}</div>;
}
