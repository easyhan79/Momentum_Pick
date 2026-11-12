import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatArea,formatWon,joinWon,pyeongToSqm,splitWon,sqmToPyeong} from '../showroom-web/src/lib/units.ts';

test('평 and ㎡ convert both ways with two decimals',()=>{
  assert.equal(pyeongToSqm(50),165.29);
  assert.equal(sqmToPyeong(165.29),50);
  assert.equal(pyeongToSqm(1),3.31);
  assert.equal(formatArea(165.29),'165.29㎡ (50평)');
});

test('억·만원 join to 원 and split back without loss',()=>{
  assert.equal(joinWon(300,null),30_000_000_000);
  assert.equal(joinWon(3,5000),350_000_000);
  assert.equal(joinWon(null,250),2_500_000);
  assert.equal(joinWon(null,null),null);
  assert.deepEqual(splitWon(350_000_000),{eok:3,man:5000});
  assert.deepEqual(splitWon(2_500_000),{eok:0,man:250});
  assert.equal(joinWon(splitWon(1_234_567_890).eok,splitWon(1_234_567_890).man),1_234_567_890);
});

test('money readout shows Korean units and the exact 원 value',()=>{
  assert.equal(formatWon(30_000_000_000),'300억 원 (30,000,000,000원)');
  assert.equal(formatWon(350_000_000),'3억 5,000만 원 (350,000,000원)');
  assert.equal(formatWon(0),'0 원 (0원)');
});
