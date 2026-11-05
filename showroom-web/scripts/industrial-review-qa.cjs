/* Run against a local Vite server. Requires Playwright (local or NODE_PATH).
 * SHOWROOM_QA_URL defaults to http://127.0.0.1:5173.
 * Blocks all nonlocal requests; never logs in or changes production records.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

(async()=>{
  const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';
  assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local server');
  const directory=path.resolve(__dirname,'../test-results/v2-industrial');
  await fs.mkdir(directory,{recursive:true});
  const result={passed:[],failures:[]};
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const page=await browser.newPage();
    const errors=[],mutations=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const request=route.request();
      if(!['GET','HEAD'].includes(request.method())){mutations.push(request.url());return route.abort();}
      return new URL(request.url()).origin===new URL(base).origin?route.continue():route.abort();
    });
    for(const fixture of ['factory','logistics','terrace','land','sparse','edges','untrusted']){
      const response=await page.goto(`${base}/samples/${fixture}`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      await page.locator('#facts').waitFor();
      await page.locator('.review-missing').evaluateAll(items=>items.forEach(item=>item.open=true));
      assert.equal(await page.locator('#industrial-review').count(),fixture==='factory'?1:0);
      if(fixture==='logistics'){
        assert.match(await page.locator('#property-review').innerText(),/접안 도크/);
        assert.equal(await page.locator('[data-review-group="logistics-lease"]').count(),0);
        assert.doesNotMatch(await page.locator('#property-review').innerText(),/공장등록/);
      }
      if(fixture==='terrace'||fixture==='sparse')assert.match(await page.locator('#property-review').innerText(),/테라스 사용권/);
      if(fixture==='land'){
        assert.match(await page.locator('#property-review').innerText(),/토지 현황/);
        assert.ok(await page.evaluate(()=>document.querySelector('#property-location').compareDocumentPosition(document.querySelector('#property-review'))&Node.DOCUMENT_POSITION_FOLLOWING));
      }
      if(fixture==='factory'){
        assert.equal(await page.locator('#industrial-review h3').count(),4);
        assert.match(await page.locator('#industrial-review').innerText(),/전력 용량/);
        assert.match(await page.locator('#industrial-review').innerText(),/확인 필요/);
        assert.match(await page.locator('#industrial-review').innerText(),/전력 공급 자료 확인 필요/);
        assert.doesNotMatch(await page.locator('#evidence').innerText(),/검증 완료된 상권/);
        assert.ok(await page.evaluate(()=>document.querySelector('#industrial-review').compareDocumentPosition(document.querySelector('#concepts'))&Node.DOCUMENT_POSITION_FOLLOWING));
        await page.getByRole('tab').first().click();
        assert.equal(await page.locator('.generated-map-empty button').count(),2);
        await page.locator('.generated-map-empty button').nth(1).click();
        assert.equal(await page.locator('.active-zone-heading .hotspot').innerText(),'2');
        assert.equal(await page.locator('#calculator').count(),0);
      }
      for(const width of [375,768,1440]){
        await page.setViewportSize({width,height:1000});
        const size=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert.ok(size.scroll<=size.inner,`${fixture} overflow at ${width}`);
        if(fixture==='factory')await page.screenshot({path:path.join(directory,`factory-${width}.png`),fullPage:true});
      }
      if(fixture==='untrusted')assert.equal(await page.evaluate(()=>window.__injected),undefined);
      result.passed.push(fixture);
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(mutations,[]);
    result.passed.push('no page errors or mutating requests');
  }catch(error){result.failures.push(String(error.stack));process.exitCode=1;}
  finally{
    await browser.close();
    await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
