import {useEffect,useState} from 'react';
import {api} from '../lib/adminApi';
import {buildingLines,distanceText,fetchedDate,locationStatus,sectionProblem,type LocationRow} from '../lib/location';

// Nearby facilities around the saved address, gathered automatically by the web worker.
/* Reloads when the draft is saved (revision), not on every keystroke; status compares with the address as saved. */
export function LocationReport({propertyId,address,revision}:{propertyId:string;address:string;revision:number}){
 const [data,setData]=useState<{available:boolean;report:LocationRow|null;address:string}|null>(null),[error,setError]=useState('');
 async function load(){const saved=address;try{setError('');const r=await api<{available:boolean;report:LocationRow|null}>(`action=location&propertyId=${propertyId}`);setData({...r,address:saved});}catch(e){setError(e instanceof Error?e.message:'주변 환경을 불러오지 못했습니다.');}}
 useEffect(()=>{void load();},[propertyId,revision]);
 const row=data?.report||null,report=row?.report,status=data?locationStatus(data.available,row,data.address):'';
 return <section id="location-report" className="glass admin-editor location-report"><h2>주변 환경 <small>자동 조사</small></h2>
  <p>저장된 소재지로 주변 시설·상가·건물·용도지역을 공공·지도 데이터에서 자동으로 조사합니다. 기획서와 글은 이 숫자만 근거로 씁니다.</p>
  {error&&<p role="alert">{error}</p>}
  {status&&<p role="status">{status}</p>}
  {report?.nearby&&<>
   <p className="location-meta">{report.roadAddress||report.matchedAddress}{report.buildingName?` · ${report.buildingName}`:''} · 출처 {report.source?.name} · 기준일 {fetchedDate(report.fetchedAt)}</p>
   <table className="location-table"><thead><tr><th scope="col">시설</th><th scope="col">반경</th><th scope="col">개수</th><th scope="col">가까운 곳</th></tr></thead>
    <tbody>{report.nearby.map(item=><tr key={item.code}><th scope="row">{item.label}</th><td>{distanceText(item.radius)}</td><td>{item.count.toLocaleString()}곳</td><td>{item.nearest.length?item.nearest.map(p=>`${p.name} ${distanceText(p.distance)}`).join(' · '):'없음'}</td></tr>)}</tbody></table>
   {report.commerce&&<div className="location-section"><h3>주변 상가</h3>{report.commerce.status==='done'?<>
    <p className="location-meta">반경 {distanceText(report.commerce.radius)} 점포 {report.commerce.total.toLocaleString()}곳{report.commerce.counted<report.commerce.total?` (업종 비율은 ${report.commerce.counted.toLocaleString()}곳 기준)`:''} · 출처 {report.commerce.source.name}{report.commerce.baseMonth?` · 기준 ${report.commerce.baseMonth}`:''}</p>
    {report.commerce.byCategory.length?<ul className="location-chips">{report.commerce.byCategory.map(c=><li key={c.name}>{c.name} <strong>{c.count.toLocaleString()}</strong></li>)}</ul>:<p>반경 안에 등록된 점포가 없습니다.</p>}
    {report.commerce.topSubcategories.length>0&&<p className="location-meta">많은 업종: {report.commerce.topSubcategories.slice(0,6).map(c=>`${c.name} ${c.count}`).join(' · ')}</p>}
   </>:<p role="status">{sectionProblem(report.commerce)}</p>}</div>}
   {report.building&&<div className="location-section"><h3>건물 정보</h3>{report.building.status==='done'?(report.building.buildings.length?<>
    {report.building.buildings.map((b,i)=><div key={i} className="location-building"><strong>{b.name||b.dong||`건물 ${i+1}`}</strong><ul>{buildingLines(b).map(line=><li key={line}>{line}</li>)}</ul></div>)}
    <p className="location-meta">출처 {report.building.source.name}{report.building.count>report.building.buildings.length?` · 주건축물 ${report.building.count}동 중 ${report.building.buildings.length}동 표시`:''}</p>
   </>:<p>이 지번에 등록된 건축물대장이 없습니다(나대지이거나 다른 지번일 수 있습니다).</p>):<p role="status">{sectionProblem(report.building)}</p>}</div>}
   {report.landUse&&<div className="location-section"><h3>토지이용계획</h3>{report.landUse.status==='done'?(report.landUse.zones.length?<>
    <ul className="location-chips">{report.landUse.zones.map(z=><li key={z.name+z.relation}>{z.name}{z.relation&&<small> {z.relation}</small>}</li>)}</ul>
    <p className="location-meta">출처 {report.landUse.source.name} · 고객에게 보이기 전 토지이음 등 원문으로 한 번 확인해 주세요.</p>
   </>:<p>조회된 용도지역·지구가 없습니다.</p>):<p role="status">{sectionProblem(report.landUse)}</p>}</div>}
  </>}
  <button type="button" className="button button-outline" onClick={()=>void load()}>새로고침</button>
 </section>;
}
