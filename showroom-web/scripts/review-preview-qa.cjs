const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
(async()=>{
  const directory=path.resolve(__dirname,'../test-results/current-preview');
  const html=await fs.readFile(path.join(directory,'SpacePick-current-preview.html'));
  const server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const result={passed:[],failures:[],externalRequests:[]};
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/^https?:/,route=>{if(new URL(route.request().url()).origin===origin)return route.continue();result.externalRequests.push(route.request().url());return route.abort();});
    await page.goto(origin);
    await page.locator('#facts').waitFor();
    await page.locator('#review-example').selectOption('terrace');
    const tabs=page.getByRole('tab');assert.equal(await tabs.count(),3);
    await tabs.nth(1).click();assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
    const before=await page.locator('#out-revenue').innerText();
    await page.locator('#slider-teams').focus();await page.locator('#slider-teams').press('ArrowRight');
    assert.notEqual(await page.locator('#out-revenue').innerText(),before);
    await page.getByRole('button',{name:'문의 화면 동작 확인',exact:true}).click();
    await page.getByText('데모 화면을 확인했습니다. 실제 문의는 접수되지 않았습니다.',{exact:true}).waitFor();
    result.passed.push('single local HTML renders actual customer components; concept tabs, calculator and inquiry demo work');
    for(const kind of ['factory','commercial','logistics','land']){
      await page.locator('#review-example').selectOption(kind+'-informed');
      assert.match(await page.locator('#customer-brief').innerText(),/제공정보/);
      assert.equal(await page.locator('#customer-brief .brief-missing').count(),kind==='commercial'?1:0);
      assert.ok(await page.evaluate(()=>document.querySelector('#customer-brief').compareDocumentPosition(document.querySelector('#concepts'))&Node.DOCUMENT_POSITION_FOLLOWING));
      assert.ok(await page.evaluate(()=>document.querySelector('#evidence').compareDocumentPosition(document.querySelector('#concepts'))&Node.DOCUMENT_POSITION_FOLLOWING));
      await page.locator('#evidence input[type="checkbox"]').nth(0).check();
      await page.locator('#evidence input[type="checkbox"]').nth(1).check();
      assert.match(await page.getByLabel('선택한 확인·자료 요청',{exact:true}).innerText(),/2건/);
      await page.getByRole('button',{name:'자료 선택 비우기',exact:true}).click();
      assert.equal(await page.getByLabel('선택한 확인·자료 요청',{exact:true}).count(),0);
      assert.equal(await page.locator('#evidence input:checked').count(),0);
      if(kind==='logistics'){
        const operations=page.locator('#customer-operations');
        assert.match(await operations.innerText(),/순수익이 아닙니다/);assert.match(await operations.innerText(),/제안·예상 조건/);
        assert.match(await operations.innerText(),/72,000,000/);assert.match(await operations.innerText(),/12,000,000/);
      }
      for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' informed overflow '+width);}
      await page.locator('#customer-brief').screenshot({path:path.join(directory,kind+'-informed-brief.png')});
      await page.locator('#evidence').screenshot({path:path.join(directory,kind+'-informed-requests.png')});
      result.passed.push(kind+' informed brief, actual information before ideas, material selection/clear and responsive widths');
    }
    for(const kind of ['terrace','factory','logistics','land']){
      await page.locator('#review-example').selectOption(kind);await page.locator('#facts').waitFor();
      assert.equal(await page.locator('#industrial-review').count(),kind==='factory'?1:0);
      for(const width of [375,1440]){
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' at '+width);
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(directory,kind+'-desktop.png'),fullPage:false});
      if(kind==='terrace'||kind==='factory'){
        await page.locator(kind==='factory'?'#industrial-review':'#property-review').screenshot({path:path.join(directory,kind+'-conditions.png')});
      }
      result.passed.push(kind+' selection and mobile/desktop layout');
    }
    assert.deepEqual(errors,[]);assert.deepEqual(result.externalRequests,[]);
  }catch(error){result.failures.push(String(error.stack));process.exitCode=1;}
  finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
