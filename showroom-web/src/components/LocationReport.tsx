import {useEffect,useState} from 'react';
import {api} from '../lib/adminApi';
import {distanceText,fetchedDate,locationStatus,type LocationRow} from '../lib/location';

// Nearby facilities around the saved address, gathered automatically by the web worker.
/* Reloads when the draft is saved (revision), not on every keystroke; status compares with the address as saved. */
export function LocationReport({propertyId,address,revision}:{propertyId:string;address:string;revision:number}){
 const [data,setData]=useState<{available:boolean;report:LocationRow|null;address:string}|null>(null),[error,setError]=useState('');
 async function load(){const saved=address;try{setError('');const r=await api<{available:boolean;report:LocationRow|null}>(`action=location&propertyId=${propertyId}`);setData({...r,address:saved});}catch(e){setError(e instanceof Error?e.message:'주변 환경을 불러오지 못했습니다.');}}
 useEffect(()=>{void load();},[propertyId,revision]);
 const row=data?.report||null,report=row?.report,status=data?locationStatus(data.available,row,data.address):'';
 return <section id="location-report" className="glass admin-editor location-report"><h2>주변 환경 <small>자동 조사</small></h2>
  <p>저장된 소재지 주변의 시설을 지도 데이터로 조사합니다. 기획서와 글은 이 숫자만 근거로 씁니다.</p>
  {error&&<p role="alert">{error}</p>}
  {status&&<p role="status">{status}</p>}
  {report?.nearby&&<>
   <p className="location-meta">{report.roadAddress||report.matchedAddress}{report.buildingName?` · ${report.buildingName}`:''} · 출처 {report.source?.name} · 기준일 {fetchedDate(report.fetchedAt)}</p>
   <table className="location-table"><thead><tr><th scope="col">시설</th><th scope="col">반경</th><th scope="col">개수</th><th scope="col">가까운 곳</th></tr></thead>
    <tbody>{report.nearby.map(item=><tr key={item.code}><th scope="row">{item.label}</th><td>{distanceText(item.radius)}</td><td>{item.count.toLocaleString()}곳</td><td>{item.nearest.length?item.nearest.map(p=>`${p.name} ${distanceText(p.distance)}`).join(' · '):'없음'}</td></tr>)}</tbody></table>
  </>}
  <button type="button" className="button button-outline" onClick={()=>void load()}>새로고침</button>
 </section>;
}
