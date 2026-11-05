import {HomePage} from './pages/HomePage';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShowroomPage } from './pages/ShowroomPage';
import type { Showroom } from './types/showroom';
import terrace from './fixtures/terrace201.fixture.json';
import informed from './fixtures/customer-informed.fixture.json';
import logistics from './fixtures/logistics-minimal.fixture.json';
import factory from './fixtures/factory-minimal.fixture.json';
import land from './fixtures/land-minimal.fixture.json';
import sparse from './fixtures/sparse-commercial.fixture.json';
import edges from './fixtures/zones-edge.fixture.json';
import untrusted from './fixtures/untrusted-text.fixture.json';
import './styles.css';
import { AdminPropertyPage } from './pages/AdminPropertyPage';
import { PublicShowroomPage } from './pages/PublicShowroomPage';
// Recovery route is lazy: importing it must not consume an ordinary page hash.
import { lazy, Suspense } from 'react';
const ResetPasswordPage=lazy(()=>import('./pages/ResetPasswordPage').then(m=>({default:m.ResetPasswordPage})));

const fixtures = { ...informed, terrace, factory, logistics, land, sparse, edges, untrusted } as unknown as Record<string, Showroom>;
const labels: Record<string, string> = {'factory-informed':'공장 · 정보 제공 예시 (합성)','commercial-informed':'상가 · 정보 제공 예시 (합성)','logistics-informed':'물류 · 정보 제공 예시 (합성)','land-informed':'토지 · 정보 제공 예시 (합성)', terrace: '상가 · 테라스201', factory: '공장 · 최소 자료', logistics: '물류센터 · 최소 자료', land: '토지 · 최소 자료', sparse: '상가 · 자료 누락', edges: '존 경계값 검토', untrusted: '텍스트 안전성 검토' };
function FixturePage({initial}:{initial:string}){
  const [fixtureId,setFixtureId]=useState(Object.hasOwn(fixtures,initial)?initial:'terrace');
  const selector=<><a href="/">Spacepick 홈 →</a><label htmlFor="fixture-select">정적 예시 살펴보기</label><select id="fixture-select" value={fixtureId} onChange={e=>{const next=e.target.value;setFixtureId(next);history.replaceState(null,'','/samples/'+next);}}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><span>구성 예시 · 실제 모집 매물 아님</span></>;
  return <ShowroomPage key={fixtureId} data={fixtures[fixtureId]} selector={selector}/>;
}
function App(){
  const query=new URLSearchParams(location.search),path=location.pathname.replace(/\/$/,'')||'/';
  if(path==='/admin/reset'||query.get('reset')==='1')return <Suspense fallback={<p>재설정 화면을 불러오는 중…</p>}><ResetPasswordPage/></Suspense>;
  if(path==='/admin'||query.get('admin')==='1')return <AdminPropertyPage/>;
  if(query.has('p'))return <PublicShowroomPage slug={query.get('p')||''}/>;
  if(path.startsWith('/samples/')||query.has('fixture'))return <FixturePage initial={path.startsWith('/samples/')?path.split('/')[2]:query.get('fixture')||'terrace'}/>;
  if(path==='/'||path==='/about'||path==='/contact')return <HomePage/>;
  let slug='';try{slug=decodeURIComponent(path.slice(1));}catch{};
  return <PublicShowroomPage slug={slug}/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
