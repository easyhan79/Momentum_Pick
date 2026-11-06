/* Synthetic, local-only v2.1 browser checks. All external requests intercepted. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const {createInquiryHandler}=await import('../../supabase/functions/showroom-inquiries/index.ts');
 const {createCrmHandler}=await import('../../supabase/functions/showroom-crm/index.ts');
 const {POLICY}=await import('../../supabase/functions/_shared/inquiries.ts');
 const {publicDto}=await import('../../supabase/functions/public-showroom/index.ts');
 const {defaultDecisionSettings}=await import('../../supabase/functions/_shared/customer-decision.ts');
 const {validateProfile}=await import('../../supabase/functions/_shared/property-profile.ts');
 const {purposesFor}=await import('../../supabase/functions/_shared/customer-purpose.ts');
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,'../test-results/v21-customer');await fs.mkdir(directory,{recursive:true});
 const result={passed:[],failures:[]},errors=[],unexpected=[];let data,snapshot,stored;const inquiryInputs=[];
 const propertyId='10000000-0000-4000-8000-000000000001',inquiryId='20000000-0000-4000-8000-000000000002';
 const backend=async(url,init={})=>{const name=String(url);if(name.endsWith('/auth/v1/user'))return Response.json({id:propertyId,app_metadata:{showroom_admin:true}});if(name.includes('/property_showrooms?'))return Response.json([{property_id:propertyId,published_content:snapshot,published_revision:1,approved_by:propertyId,approved_at:'now',published_at:'now',listing_state:'active'}]);if(name.endsWith('/rpc/crm_register_context_inquiry')){const args=JSON.parse(init.body);stored={id:inquiryId,property_id:args.p_expected_property,...args.p_data};return Response.json({id:inquiryId,existing:false});}if(name.includes('/property_inquiries?'))return Response.json(stored?[stored]:[]);if(name.includes('/inquiry_activity?'))return Response.json([]);throw Error('unexpected mock backend');};
 const inquiryHandler=createInquiryHandler({url:'https://synthetic-db.invalid',key:'synthetic',fetcher:backend});
 const crmHandler=createCrmHandler({url:'https://synthetic-db.invalid',key:'synthetic',fetcher:backend});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===new URL(base).origin){if(u.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic'}});return route.continue();}if(u.hostname==='synthetic-media.invalid')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTdcAAAAASUVORK5CYII=','base64')});if(u.pathname.endsWith('/public-showroom'))return route.fulfill({json:{showroom:data,canonical_slug:'v21-qa'},headers:{'access-control-allow-origin':'*'}});if(u.pathname.endsWith('/showroom-inquiries')&&u.searchParams.get('action')==='policy')return route.fulfill({json:{policy:POLICY},headers:{'access-control-allow-origin':'*'}});if(u.pathname.endsWith('/showroom-inquiries')&&route.request().method()==='POST'){const body=route.request().postData();inquiryInputs.push(JSON.parse(body));return inquiryHandler(new Request(route.request().url(),{method:'POST',headers:{'content-type':'application/json'},body})).then(async response=>route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}}));}if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});unexpected.push(u.pathname);return route.abort();});
  for(const kind of ['commercial','land','factory','logistics','income'])for(const materials of (process.env.V21_MATERIAL_QA==='1'?['minimal','plan','photo','both']:['minimal'])){
   const profile={version:1,kind,transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[{id:'provided-zero',key:'power_capacity',label:'전력 용량',value:0,unit:'kW',status:'provided',asOf:'2026-11-01',sourceText:'합성 제공자료',sourceIds:[],publication:'approved',useApproved:true}],sourcePermissions:[],highlights:[]};
   profile.fields.push({...profile.fields[0],id:'private-ref',value:'PRIVATE_SECRET',publication:'private'});
   profile.modules={customerDecision:{...defaultDecisionSettings(kind),publication:'approved',reviewConfirmed:true}};
   const validated=validateProfile(profile,{assets:[],userId:'synthetic-admin',now:'2026-11-07T00:00:00Z'});
   snapshot={schema_version:'1.0',id:'10000000-0000-4000-8000-000000000001',category:['factory','logistics'].includes(kind)?'industrial':kind,title:'합성 '+kind,subtitle:'제공자료로 검토하는 예시',summary:'합성 자료이며 실제 매물이 아닙니다.',propertyProfile:validated,facts:[],concepts:[],unknowns:[],assets:[]};data=publicDto(snapshot);
   const opts=purposesFor(kind);
   data.concepts=[{id:'concept-2',conceptName:'두 번째 목적 활용',headline:'가설 2',rationale:'조건 확인 필요',purposeIds:[opts[1].id],zones:[]},{id:'concept-1',conceptName:'첫 번째 목적 활용',headline:'가설 1',rationale:'조건 확인 필요',purposeIds:[opts[0].id],zones:[]}];
   const asset=(id,kind,generated=false,conceptId='')=>({id,kind,generated,conceptId,url:'https://synthetic-media.invalid/'+id+'.png',caption:'합성 제공자료',alt:'합성',approved:true,imageType:generated?(materials==='plan'?'plan':materials==='photo'||materials==='both'?'photo':'concept'):undefined});
   data.assets=[asset('ai-first','concept',true,'concept-1'),asset('ai-second','concept',true,'concept-2')];
   if(['photo','both'].includes(materials))data.assets.push(asset('provided-photo','photo'));
   if(['plan','both'].includes(materials))data.assets.push(asset('provided-plan','provided_plan'));
   snapshot.concepts=structuredClone(data.concepts);snapshot.assets=structuredClone(data.assets);
   await page.goto(base+'/v21-qa?source=blog');const select=page.getByLabel('고객 목적 선택',{exact:true});await select.waitFor();assert.equal(await select.inputValue(),'');
   const purposes=purposesFor(kind);await select.selectOption(purposes[0].id);const first=await page.locator('.purpose-slot').first().getAttribute('data-slot-key');assert.equal(first,purposes[0].keys[0]);await page.locator('#tab-concept-1').waitFor();assert.equal(await page.locator('#tab-concept-1').getAttribute('aria-selected'),'true');assert.match(await page.locator('#concept-panel .plan-surface img').getAttribute('src'),/ai-first/);
   assert.match(await page.locator('.purpose-risk').innerText(),new RegExp(purposes[0].risk.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   await select.selectOption(purposes[1].id);assert.equal(await page.locator('.purpose-slot').first().getAttribute('data-slot-key'),purposes[1].keys[0]);
   assert.equal(new URL(page.url()).searchParams.get('source'),'blog');await page.reload();assert.equal(await select.inputValue(),purposes[1].id);
   const cards=page.locator('#decision-cards');await cards.waitFor();assert.ok(await cards.getByRole('heading',{name:'결론',exact:true}).count());assert.ok(await cards.getByRole('heading',{name:'근거·기준일',exact:true}).count());assert.ok(await cards.getByRole('heading',{name:'의미·제약',exact:true}).count());assert.ok(await cards.getByRole('heading',{name:'추가 확인사항',exact:true}).count());assert.equal((await page.locator('body').innerText()).includes('PRIVATE_SECRET'),false);
   for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   if(kind==='commercial')await page.locator('#customer-purpose').screenshot({path:path.join(directory,'commercial-purpose.png')});
   if(process.env.V21_INQUIRY_QA==='1'&&kind==='factory'&&materials==='minimal'){
    await select.selectOption(purposes[0].id);
    await page.locator('#customer-purpose').getByLabel('전력 용량 확인 요청',{exact:true}).check();
    await page.locator('#inquiry-name').fill('합성 문의');await page.locator('#inquiry-phone').fill('01000000000');await page.locator('#inquiry-use').fill('합성 전력 확인');await page.locator('#inquiry-memo').fill('추가 합성 메모');await page.locator('input[name="consent"]').check();
    await page.getByRole('button',{name:'문의 접수',exact:true}).click();await page.locator('#inquiry').getByText('문의가 접수되었습니다.',{exact:true}).waitFor();
    assert.equal(inquiryInputs.length,1);assert.ok(inquiryInputs[0].request_context.checkIds.includes('need-power_capacity'));
    const denied=await crmHandler(new Request('https://x.test?action=detail&id='+inquiryId));assert.equal(denied.status,401);
    const response=await crmHandler(new Request('https://x.test?action=detail&id='+inquiryId,{headers:{Authorization:'Bearer synthetic-admin'}}));const detail=await response.json();
    assert.equal(detail.inquiry.property_id,propertyId);assert.match(detail.inquiry.memo,/제조 운영/);assert.match(detail.inquiry.memo,/need-power_capacity/);assert.match(detail.inquiry.memo,/첫 번째 목적 활용/);assert.match(detail.inquiry.memo,/추가 합성 메모/);assert.doesNotMatch(detail.inquiry.memo,/PRIVATE_SECRET/);
    result.passed.push('public purpose/check selection -> validated inquiry -> authenticated existing CRM with canonical context; anonymous CRM denied');
   }
   await select.selectOption('');assert.equal(new URL(page.url()).searchParams.has('purpose'),false);
   const visual=page.locator('#visual-evidence');assert.equal(await visual.getByRole('heading',{name:'제공 현장사진',exact:true}).count(),['photo','both'].includes(materials)?1:0);assert.equal(await visual.getByRole('heading',{name:'제공 도면 · 실측 확인 필요',exact:true}).count(),['plan','both'].includes(materials)?1:0);
   result.passed.push(kind+'/'+materials+': selection changes slots/risk, preserves source query and reload, 375/768/1440');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 }catch(e){result.failures.push(String(e.stack||e));}finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({...result,errors,unexpected},null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
