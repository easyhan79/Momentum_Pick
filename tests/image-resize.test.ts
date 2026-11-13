import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isHeic,isPdf,needsPreparation,outputType,renamed,targetSize} from '../showroom-web/src/lib/imageResize.ts';

test('large images shrink to a 2,560px long edge and keep their ratio',()=>{
  assert.deepEqual(targetSize(4032,3024),{width:2560,height:1920});
  assert.deepEqual(targetSize(3000,6000),{width:1280,height:2560});
  assert.deepEqual(targetSize(1200,800),{width:1200,height:800});
});

test('only large, heavy or unsupported images are re-encoded',()=>{
  assert.equal(needsPreparation({type:'image/jpeg',size:1_000_000},2000,1500),false);
  assert.equal(needsPreparation({type:'image/jpeg',size:1_000_000},4000,3000),true);
  assert.equal(needsPreparation({type:'image/png',size:5_000_000},2000,1500),true);
  assert.equal(needsPreparation({type:'image/heic',size:1_000_000},2000,1500),true);
});

test('plans stay PNG, other images become JPEG; HEIC and PDF are recognised',()=>{
  assert.equal(outputType('image/png','provided_plan'),'image/png');
  assert.equal(outputType('image/png','photo'),'image/jpeg');
  assert.equal(outputType('image/heic','photo'),'image/jpeg');
  assert.equal(renamed('IMG_0001.HEIC','image/jpeg'),'IMG_0001.jpg');
  assert.ok(isHeic({name:'a.heic',type:''}));assert.ok(isHeic({name:'a.bin',type:'image/heif'}));
  assert.ok(isPdf({name:'x.pdf',type:'application/pdf'}));assert.ok(!isPdf({name:'x.png',type:'image/png'}));
});
