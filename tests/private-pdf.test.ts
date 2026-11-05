import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PRIVATE_PDF_BYTES,privatePdfBytes} from '../showroom-web/src/lib/privatePdf.ts';
const pdf=new TextEncoder().encode('%PDF-1.7\nsynthetic bytes; parser validity is tested in browser');
const response=(data:Uint8Array=pdf,headers:Record<string,string>={})=>new Response(data,{headers:{'Content-Type':'application/pdf',...headers}});
test('private PDF response keeps bytes intact and accepts only the original SHA256',async()=>{
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pdf))].map(n=>n.toString(16).padStart(2,'0')).join('');
  assert.deepEqual(await privatePdfBytes(response(),digest),pdf);
  await assert.rejects(()=>privatePdfBytes(response(),'0'.repeat(64)),/분석 당시 원본과 현재 파일이 다릅니다/);
});
test('viewer rejects authorization errors, HTML and mismatched PDF magic bytes',async()=>{
  await assert.rejects(()=>privatePdfBytes(new Response('denied',{status:403})),/권한/);
  await assert.rejects(()=>privatePdfBytes(response(pdf,{'Content-Type':'text/html'})),/PDF 원본 응답/);
  await assert.rejects(()=>privatePdfBytes(response(new TextEncoder().encode('<html>secret'))),/PDF 형식/);
});
test('declared and streamed size limits are enforced and oversized streaming is cancelled',async()=>{
  await assert.rejects(()=>privatePdfBytes(response(pdf,{'Content-Length':String(MAX_PRIVATE_PDF_BYTES+1)})),/8MB/);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_PRIVATE_PDF_BYTES));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
  await assert.rejects(()=>privatePdfBytes(new Response(stream,{headers:{'Content-Type':'application/pdf'}})),/8MB/);
  assert.ok(cancelled);
});
