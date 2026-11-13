/* Browser check for draft autosave and the leave warning. Uses the real admin
 * handler with an in-memory draft; all nonlocal traffic is intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001';
 let room={id:property,property_id:property,slug:'conflict-qa',showroom_status:'draft',revision:1,draft_content:{schema_version:'1.0',id:property,category:'commercial',title:'합성 상가 예시',subtitle:'처음 헤드라인',summary:'처음 요약입니다.',address:'합성 소재지',facts:[],concepts:[],unknowns:[],assets:[]}};
 let slowSave=false,failNext=false,patchCalls=0;
 const background=summary=>{room={...room,revision:room.revision+1,draft_content:{...room.draft_content,summary}};};
 const mockFetch=async(url,init={})=>{
   const pathname=String(url);
   if(pathname.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
   if(pathname.endsWith('/rpc/showroom_save_concept_draft')){const args=JSON.parse(init.body);if(args.p_revision!==room.revision)return Response.json([]);room={...room,draft_content:args.p_content,revision:room.revision+1};return Response.json(room);}
   if(pathname.includes('/property_showrooms?')){
     if(init.method==='PATCH'){
       patchCalls++;if(failNext){failNext=false;return new Response('fail',{status:500});}if(slowSave)await new Promise(r=>setTimeout(r,2500));
       if(!pathname.includes('revision=eq.'+room.revision))return Response.json([]);
       room={...room,...JSON.parse(init.body)};
     }
     return Response.json([room]);
   }
   if(pathname.includes('/properties?'))return Response.json([{id:property,address:'합성 소재지',status:'analyzed',created_at:'2026-11-12T01:00:00Z',ai_contents:{}}]);
   if(['/property_web_intakes?','/property_assets?','/property_image_jobs?','/property_image_budgets?','/property_showroom_routes?','/property_analysis_jobs?','/property_inquiries?','/inquiry_activity?'].some(p=>pathname.includes(p)))return Response.json([]);
   throw Error('Unexpected mock database request: '+pathname);
 };
 const admin=createHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch});
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,'../test-results/autosave');await fs.mkdir(directory,{recursive:true});
 const result={passed:[],failures:[]},errors=[],unexpected=[];
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let page;
 try{
   page=await browser.newPage({viewport:{width:1440,height:900}});
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin===new URL(base).origin){
       if(url.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic-public-key'}});
       return route.continue();
     }
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, PATCH, OPTIONS','access-control-allow-headers':'*'}});
     if(url.pathname==='/auth/v1/token')return route.fulfill({json:{access_token:'synthetic-user',refresh_token:'synthetic-refresh',expires_in:3600}});
     if(url.pathname==='/functions/v1/showroom-assets')return route.fulfill({json:{assets:[]}});
     if(url.pathname==='/functions/v1/showroom-admin'){
       const response=await admin(new Request(request.url(),{method:request.method(),headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},...(request.postData()?{body:request.postData()}:{})}));
       return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
     }
     unexpected.push(url.pathname);return route.abort();
   });
   await page.goto(base+'/admin');
   await page.getByLabel('이메일',{exact:true}).fill('qa@example.invalid');
   await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password-123');
   await page.getByRole('button',{name:'로그인',exact:true}).click();
   await page.getByRole('button',{name:'초안 열기',exact:true}).click();await page.getByRole('button',{name:'고급 편집 · 전체 패널',exact:true}).click();/* these checks cover every panel */
   const headline=page.locator('#draft-subtitle'),status=page.locator('.admin-steps .save-status');
   await headline.waitFor();
   // 1. An edit is saved automatically about five seconds later.
   await headline.fill('자동 저장 헤드라인');
   assert.match(await status.innerText(),/저장 전 수정 있음 · 곧 자동 저장/);
   await page.waitForFunction(()=>/자동 저장됨/.test(document.querySelector('.admin-steps .save-status')?.textContent||''),null,{timeout:12000});
   assert.equal(room.draft_content.subtitle,'자동 저장 헤드라인');
   result.passed.push('an edit is saved automatically and the status shows the save time');

   // 2. Typing during a slow autosave is kept and saved next.
   slowSave=true;await headline.fill('첫 번째 수정');
   await page.waitForFunction(()=>/저장 중/.test(document.querySelector('.admin-steps .save-status')?.textContent||''),null,{timeout:12000});
   await headline.fill('저장 중에 친 두 번째 수정');
   await page.waitForFunction(()=>!/저장 중/.test(document.querySelector('.admin-steps .save-status')?.textContent||''),null,{timeout:12000});
   assert.equal(await headline.inputValue(),'저장 중에 친 두 번째 수정');
   slowSave=false;
   await page.waitForFunction(()=>/자동 저장됨/.test(document.querySelector('.admin-steps .save-status')?.textContent||''),null,{timeout:12000});
   await page.waitForFunction(()=>true);assert.equal(room.draft_content.subtitle,'저장 중에 친 두 번째 수정');
   result.passed.push('typing during a slow autosave is not overwritten and is saved by the next autosave');

   // 3. A failed autosave is reported once and not retried until the draft changes again.
   failNext=true;const before=patchCalls;await headline.fill('실패할 수정');
   await page.getByText('자동 저장하지 못했습니다.',{exact:false}).waitFor({timeout:12000});
   await page.waitForTimeout(6500);assert.equal(patchCalls,before+1);
   await headline.fill('다시 고친 수정');
   await page.waitForFunction(()=>/자동 저장됨/.test(document.querySelector('.admin-steps .save-status')?.textContent||''),null,{timeout:12000});
   assert.equal(room.draft_content.subtitle,'다시 고친 수정');
   result.passed.push('a failed autosave is reported once and retried only after the next edit');

   // 4. Leaving with unsaved edits asks first. (Headless Chromium never shows the native dialog,
   //    so the check sends the leave event and confirms the page asks to keep it open.)
   const leave=()=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
   assert.equal(await leave(),false,'no warning when everything is saved');
   await headline.fill('저장 안 한 수정');
   assert.equal(await leave(),true,'warning when the draft has unsaved edits');
   result.passed.push('leaving with unsaved edits asks for confirmation; leaving after saving does not');

   if(errors.length)throw Error('Page errors: '+errors.join(' | '));
   if(unexpected.length)throw Error('Unexpected requests: '+unexpected.join(', '));
 }catch(error){result.failures.push(error instanceof Error?error.message:String(error));if(page&&!page.isClosed())await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
