import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createZip,crc32} from '../showroom-web/src/lib/zip.ts';
import {naverBlogPost,photoFileName} from '../showroom-web/src/lib/naverBlog.ts';

test('crc32 matches the standard check value',()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);});

test('the ZIP opens with a standard reader and keeps Korean file names and bytes',()=>{
  const a=new Uint8Array([137,80,78,71,1,2,3]),b=new TextEncoder().encode('두 번째');
  const dir=mkdtempSync(join(tmpdir(),'zip-'));const file=join(dir,'cards.zip');
  writeFileSync(file,createZip([{name:'카드01.png',data:a},{name:'카드02.txt',data:b}]));
  const out=execFileSync('python3',['-I','-c','import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps([[i.filename,list(z.read(i))] for i in z.infolist()]))',file]).toString();
  assert.deepEqual(JSON.parse(out),[['카드01.png',[...a]],['카드02.txt',[...b]]]);
});

const img=(id:string,caption:string)=>({id,caption,source_type:'ai_generated',url:'blob:'+id});
const text='제목: 테라스 상가 소개\n■ 위치\n역에서 가깝습니다.\n■ 공간\n**넓은** 테라스가 있습니다.\n마무리 문단입니다.';

test('the Naver post separates the title, keeps headings and marks numbered photo slots',()=>{
  const post=naverBlogPost(text,[img('h','대표 이미지'),img('c1','콘셉트 1')],'https://spacepick.kr/terrace-201');
  assert.equal(post.title,'테라스 상가 소개');
  assert.doesNotMatch(post.plain,/제목:/);
  assert.match(post.html,/<strong style="font-size:19px">위치<\/strong>/);
  assert.match(post.html,/<strong>넓은<\/strong>/);
  assert.deepEqual(post.photos.map(p=>p.number),[1,2]);
  assert.match(post.plain,/\[사진 1 넣기 · AI 활용 예시 · 실제 사진 아님 · 대표 이미지\]/);
  assert.match(post.plain,/매물 자세히 보기·문의: https:\/\/spacepick.kr\/terrace-201/);
  assert.equal(photoFileName(post.photos[0],'image/png'),'사진01.png');
});

test('text is escaped so pasted content cannot inject markup',()=>{
  const post=naverBlogPost('제목: <b>x</b>\n<script>alert(1)</script>',[]);
  assert.doesNotMatch(post.html,/<script>/);
  assert.match(post.html,/&lt;script&gt;/);
});

test('every photo gets a slot, spread through the text',async()=>{
  const {photoSlots}=await import('../showroom-web/src/lib/naverBlog.ts');
  assert.deepEqual(photoSlots(5,1),[1]);
  assert.deepEqual(photoSlots(6,2),[1,3]);
  assert.deepEqual(photoSlots(2,3),[0,0,0]);
  assert.deepEqual(photoSlots(0,2),[-1,-1]);
});
