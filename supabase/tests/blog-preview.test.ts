import {test} from 'node:test';import assert from 'node:assert/strict';
import {normalizeCopy,parseBlog} from '../../showroom-web/src/lib/blogPreview.ts';
test('escaped linebreaks and section markers become readable blocks without losing claims',()=>{
 const input='[투자자 브리핑]\\n제목: 매물 소개\\n가격 95억 · 허가 유효성 확인 필요\\n■ 입지\\n제공 주소';
 const parsed=parseBlog(input);assert.equal(parsed.title,'매물 소개');assert.ok(parsed.blocks.some(b=>b.kind==='heading'&&b.text==='입지'));assert.ok(parsed.blocks.some(b=>b.text.includes('허가 유효성 확인 필요')));assert.equal(normalizeCopy(input).includes('\\n'),false);
});
test('untrusted HTML is retained as plain text for React escaping',()=>{assert.ok(parseBlog('제목: test\n<script>alert(1)</script>').blocks[0].text.includes('<script>'));});
