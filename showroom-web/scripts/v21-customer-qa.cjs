/* Synthetic, local-only v2.1 browser checks. All external requests intercepted. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const {publicDto}=await import('../../supabase/functions/public-showroom/index.ts');
 const {purposesFor}=await import('../../supabase/functions/_shared/customer-purpose.ts');
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,'../test-results/v21-customer');await fs.mkdir(directory,{recursive:true});
 const result={passed:[],failures:[]},errors=[],unexpected=[];let data;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(base).origin){if(u.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic'}});return route.continue();}if(u.pathname.endsWith('/public-showroom'))return route.fulfill({json:{showroom:data,canonical_slug:'v21-qa'},headers:{'access-control-allow-origin':'*'}});if(u.pathname.endsWith('/showroom-inquiries')&&u.searchParams.get('action')==='policy')return route.fulfill({json:{policy:{version:'qa',operator:'합성',contact:'qa@example.invalid',retentionDays:90}},headers:{'access-control-allow-origin':'*'}});if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});unexpected.push(u.pathname);return route.abort();});
  for(const kind of ['commercial','land','factory','logistics','income']){
   const profile={version:1,kind,transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[{id:'provided-zero',key:'power_capacity',label:'전력 용량',value:0,unit:'kW',status:'provided',sourceText:'합성 제공자료',sourceIds:[],publication:'approved',useApproved:true}],sourcePermissions:[],highlights:[]};
   data=publicDto({schema_version:'1.0',id:'10000000-0000-4000-8000-000000000001',category:['factory','logistics'].includes(kind)?'industrial':kind,title:'합성 '+kind,subtitle:'제공자료로 검토하는 예시',summary:'합성 자료이며 실제 매물이 아닙니다.',propertyProfile:profile,facts:[],concepts:[],unknowns:[],assets:[]});
   await page.goto(base+'/v21-qa?source=blog');const select=page.getByLabel('고객 목적 선택',{exact:true});await select.waitFor();assert.equal(await select.inputValue(),'');
   const purposes=purposesFor(kind);await select.selectOption(purposes[0].id);const first=await page.locator('.purpose-slot').first().getAttribute('data-slot-key');assert.equal(first,purposes[0].keys[0]);
   assert.match(await page.locator('.purpose-risk').innerText(),new RegExp(purposes[0].risk.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   await select.selectOption(purposes[1].id);assert.equal(await page.locator('.purpose-slot').first().getAttribute('data-slot-key'),purposes[1].keys[0]);
   assert.equal(new URL(page.url()).searchParams.get('source'),'blog');await page.reload();assert.equal(await select.inputValue(),purposes[1].id);
   for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   if(kind==='commercial')await page.locator('#customer-purpose').screenshot({path:path.join(directory,'commercial-purpose.png')});
   await select.selectOption('');assert.equal(new URL(page.url()).searchParams.has('purpose'),false);
   result.passed.push(kind+': selection changes slots/risk, preserves source query and reload, 375/768/1440');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 }catch(e){result.failures.push(String(e.stack||e));}finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({...result,errors,unexpected},null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
