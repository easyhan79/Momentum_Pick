import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
// No backend or other external traffic is permitted while inspecting the build.
globalThis.fetch=async()=>{throw Error('Unexpected network in built asset test');};
const {default:worker}=await import('../dist/server/index.js');
const request=path=>worker.fetch(new Request('https://local.invalid'+path));
const require=createRequire(import.meta.url),{version}=require('pdfjs-dist/package.json');
test('built Worker serves PDF worker module, CJK maps, decoders and dependency licenses with usable MIME',async()=>{
  const source=fs.readFileSync(new URL('../dist/server/index.js',import.meta.url),'utf8');
  const workerPath=source.match(/\/assets\/pdf\.worker\.min-[a-zA-Z0-9_-]+\.mjs/)?.[0];assert.ok(workerPath);
  const module=await request(workerPath);assert.equal(module.status,200);assert.match(module.headers.get('Content-Type'),/javascript/);assert.ok((await module.arrayBuffer()).byteLength>100000);
  const prefix=`/pdfjs/${version}/`;
  for(const name of ['cmaps/UniKS-UCS2-H.bcmap','standard_fonts/FoxitSerif.pfb','wasm/openjpeg.wasm','standard_fonts/LICENSE_LIBERATION','wasm/LICENSE_OPENJPEG','LICENSE_PDFJS']){
    const response=await request(prefix+name);assert.equal(response.status,200,name);assert.ok((await response.arrayBuffer()).byteLength>20,name);
    if(name.endsWith('.wasm'))assert.equal(response.headers.get('Content-Type'),'application/wasm');
  }
});
test('PDF renderer stays in a lazy chunk and customer PDF files are absent from public build assets',async()=>{
  const html=await(await request('/admin')).text();
  assert.doesNotMatch(html,/DocumentPdfViewer|pdf\.worker/);
  const source=fs.readFileSync(new URL('../dist/server/index.js',import.meta.url),'utf8');
  assert.match(source,/\/assets\/DocumentPdfViewer-[a-zA-Z0-9_-]+\.js/);
  assert.doesNotMatch(source,/"\/[^"\s]+\.pdf":\{"type":/);
  const missing=await request('/pdfjs/private-document.pdf');assert.equal(missing.status,404);
});
