// Export the existing customer components as one local review file.
// This does not build/publish a new site or include private property documents.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import tailwindcss from '@tailwindcss/vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=path.join(root,'test-results/current-preview');
await fs.mkdir(directory,{recursive:true});
const entry=path.join(root,'test-results/review-preview-entry.tsx');
await fs.writeFile(entry,`
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ShowroomPage} from '../src/pages/ShowroomPage';
import terrace from '../src/fixtures/terrace201.fixture.json';
import factory from '../src/fixtures/factory-minimal.fixture.json';
import logistics from '../src/fixtures/logistics-minimal.fixture.json';
import land from '../src/fixtures/land-minimal.fixture.json';
import informed from '../src/fixtures/customer-informed.fixture.json';
import '../src/styles.css';
const examples=Object.fromEntries(Object.entries({...informed,terrace,factory,logistics,land}).map(([key,data])=>[key,{...data,heroAsset:data.heroAsset?{...data.heroAsset,url:''}:undefined,assets:data.assets.map(asset=>({...asset,url:''}))}]));
const labels={'factory-informed':'공장 · 정보 제공 예시 (합성)','commercial-informed':'상가 · 정보 제공 예시 (합성)','logistics-informed':'물류 · 정보 제공 예시 (합성)','land-informed':'토지 · 정보 제공 예시 (합성)',terrace:'상가 · 테라스 예시',factory:'공장 · 최소 자료',logistics:'물류센터 · 최소 자료',land:'토지 · 최소 자료'};
function Review(){
 const [kind,setKind]=useState('factory-informed');
 const selector=<><label htmlFor="review-example">현재 구현 화면 선택</label><select id="review-example" value={kind} onChange={event=>setKind(event.target.value)}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><span>고객 정보 보강 구현 · 합성 구성 예시 · 외부 사진은 오프라인에서 표시되지 않음</span></>;
 return <ShowroomPage key={kind} data={examples[kind]} selector={selector}/>;
}
createRoot(document.getElementById('root')).render(<Review/>);
`);
try{
  const built=await build({root,configFile:false,plugins:[tailwindcss()],logLevel:'error',build:{write:false,minify:true,cssCodeSplit:false,rollupOptions:{input:entry,output:{inlineDynamicImports:true}}}});
  const outputs=Array.isArray(built)?built.flatMap(item=>item.output):built.output;
  const javascript=outputs.filter(item=>item.type==='chunk').map(item=>item.code).join('\n');
  const css=outputs.filter(item=>item.type==='asset'&&item.fileName.endsWith('.css')).map(item=>item.source).join('\n');
  if(!javascript||!css)throw Error('Review export is missing its code or styles');
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>SpacePick · 현재 구현 미리보기</title><style>${css.replaceAll('</style','<\\/style')}</style></head><body><div id="root"></div><script type="module">${javascript.replaceAll('</script','<\\/script')}</script></body></html>`;
  const destination=path.join(directory,'SpacePick-current-preview.html');
  await fs.writeFile(destination,html);
  await fs.writeFile(path.join(directory,'README.txt'),'SpacePick 현재 구현 미리보기\n\nSpacePick-current-preview.html을 브라우저에서 여세요. 상단에서 상가/공장/물류/토지를 선택할 수 있습니다.\n현재 소스의 실제 고객 화면 컴포넌트를 묶은 검토용 파일입니다. 고객 정보 보강(T11)을 반영했습니다. 정보 제공 예시와 최소 자료 예시를 비교할 수 있습니다.\n예시 자료만 포함하며 업로드 PDF와 관리자 계정/개인정보를 포함하지 않습니다. 실제 문의/분석/게시를 실행하지 않습니다. 외부 사진 자동 요청은 차단하므로 이미지 영역은 준비 중으로 보일 수 있습니다.\n');
  console.log(destination);
  console.log('Local review file bytes:',Buffer.byteLength(html));
}finally{await fs.rm(entry,{force:true});}
