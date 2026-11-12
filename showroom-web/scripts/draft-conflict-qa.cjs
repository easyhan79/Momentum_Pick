/* Browser check for the save/reload deadlock: a background change bumps the
 * draft revision while the admin has unsaved edits. Uses the real admin
 * handler with an in-memory draft; all nonlocal traffic is intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001';
 let room={id:property,property_id:property,slug:'conflict-qa',showroom_status:'draft',revision:1,draft_content:{schema_version:'1.0',id:property,category:'commercial',title:'합성 상가 예시',subtitle:'처음 헤드라인',summary:'처음 요약입니다.',address:'합성 소재지',facts:[],concepts:[],unknowns:[],assets:[]}};
 const background=summary=>{room={...room,revision:room.revision+1,draft_content:{...room.draft_content,summary}};};
 const mockFetch=async(url,init={})=>{
   const pathname=String(url);
   if(pathname.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
   if(pathname.endsWith('/rpc/showroom_save_concept_draft')){const args=JSON.parse(init.body);if(args.p_revision!==room.revision)return Response.json([]);room={...room,draft_content:args.p_content,revision:room.revision+1};return Response.json(room);}
   if(pathname.includes('/property_showrooms?')){
     if(init.method==='PATCH'){
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
 const directory=path.resolve(__dirname,'../test-results/draft-conflict');await fs.mkdir(directory,{recursive:true});
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
   await page.getByRole('button',{name:'초안 열기',exact:true}).click();
   const headline=page.locator('#draft-subtitle'),conflict=page.locator('.admin-conflict');
   await headline.waitFor();

   // 1. Unsaved edit + background change → save is rejected but the admin is not stuck.
   await headline.fill('관리자가 고친 헤드라인');
   background('자동 준비가 바꾼 요약');
   await page.getByRole('button',{name:'초안 저장',exact:true}).first().click();
   await conflict.waitFor();
   const box=await conflict.boundingBox();
   assert.ok(box&&box.y>=0&&box.y+box.height<=900,'conflict choices are visible without scrolling to the page bottom');
   assert.equal(await page.getByRole('button',{name:'최신 저장본 불러오기',exact:true}).isEnabled(),true);
   await page.screenshot({path:path.join(directory,'conflict-1440.png')});
   await page.getByRole('button',{name:'내 수정을 최신본에 다시 적용',exact:true}).click();
   await page.getByText('최신 저장본에 내 수정 내용을 다시 적용해 저장했습니다.',{exact:false}).waitFor();
   assert.equal(room.draft_content.subtitle,'관리자가 고친 헤드라인');
   assert.equal(room.draft_content.summary,'자동 준비가 바꾼 요약');
   assert.equal(await conflict.count(),0);
   result.passed.push('re-apply keeps the admin edit and the newer background change, then saves');

   // 2. Discard choice loads the latest draft.
   await headline.fill('버릴 수정');
   background('두 번째 자동 변경');
   await page.getByRole('button',{name:'초안 저장',exact:true}).first().click();
   await conflict.waitFor();
   await page.getByRole('button',{name:'내 수정 버리고 최신본 불러오기',exact:true}).click();
   await page.getByText('저장하지 않은 수정 내용을 버리고 최신 저장본을 불러왔습니다.',{exact:false}).waitFor();
   assert.equal(await headline.inputValue(),'관리자가 고친 헤드라인');
   assert.equal(room.draft_content.summary,'두 번째 자동 변경');
   result.passed.push('discard loads the latest draft and clears the unsaved state');

   // 3. Reload is no longer locked by unsaved edits; it asks before discarding.
   await headline.fill('확인 후 버릴 수정');
   page.once('dialog',dialog=>dialog.accept());
   await page.getByRole('button',{name:'최신 저장본 불러오기',exact:true}).click();
   await page.getByText('최신 분석 결과와 저장본을 불러왔습니다.',{exact:false}).waitFor();
   assert.equal(await headline.inputValue(),'관리자가 고친 헤드라인');
   result.passed.push('reload with unsaved edits asks for confirmation instead of being disabled');

   // 4. An entered but private area blocks publishing once; one click publishes it and saves.
   const panel=page.locator('#publish-review');
   room={...room,revision:room.revision+1,draft_content:{...room.draft_content,propertyProfile:{version:1,kind:'commercial',transaction:'sale',price:{status:'negotiable',saleWon:null,depositWon:null,monthlyWon:null},fields:[{id:'initial-area',key:'exclusive_area',label:'전용면적',value:165,unit:'㎡',status:'provided',sourceText:'등록자 제공정보 · 미검증',sourceIds:[],useApproved:false,publication:'private'}],sourcePermissions:[],highlights:[]}}};
   await page.getByRole('button',{name:'최신 저장본 불러오기',exact:true}).click();
   await page.getByText('최신 분석 결과와 저장본을 불러왔습니다.',{exact:false}).waitFor();
   await panel.getByRole('button',{name:'조건 다시 확인',exact:true}).click();
   await panel.getByRole('button',{name:'입력한 면적 공개',exact:true}).click();
   await page.getByText('입력한 면적을 공개로 바꾸고 저장했습니다.',{exact:false}).waitFor();
   assert.equal(room.draft_content.propertyProfile.fields[0].publication,'approved');
   assert.equal(room.draft_content.propertyProfile.fields[0].useApproved,true);
   result.passed.push('a private entered area is published with one click from the publish panel');

   // 5. Area is entered in 평 and price in 억·만원; values are saved as ㎡ and 원.
   const facts=page.locator('#property-facts-editor');
   const areaInput=facts.getByLabel('값',{exact:true}).first();
   assert.equal(await areaInput.inputValue(),'49.91');
   await areaInput.fill('30');
   await facts.getByText('99.17㎡ (30평)',{exact:true}).waitFor();
   await facts.getByLabel('가격 상태',{exact:true}).selectOption('fixed');
   await facts.getByLabel('매매가격 억',{exact:true}).fill('3');
   await facts.getByLabel('매매가격 만원',{exact:true}).fill('5000');
   await facts.getByText('3억 5,000만 원 (350,000,000원)',{exact:true}).waitFor();
   await facts.screenshot({path:path.join(directory,'units-facts-editor.png')});
   await page.getByRole('button',{name:'초안 저장',exact:true}).first().click();
   await page.getByText('컨셉존과 쇼룸 초안을 저장했습니다.',{exact:false}).waitFor();
   assert.equal(room.draft_content.propertyProfile.fields[0].value,99.17);
   assert.equal(room.draft_content.propertyProfile.price.saleWon,350000000);
   result.passed.push('area typed in 평 and price in 억·만원 are saved as ㎡ and 원');

   // 6. Publish panel: no review step, checkboxes or memo; one confirmation publishes a draft.
   assert.equal(await panel.getByRole('button',{name:'저장본 검수 준비',exact:true}).count(),0);
   assert.equal(await panel.locator('input[type=checkbox], textarea').count(),0);
   await panel.getByRole('button',{name:'조건 다시 확인',exact:true}).click();
   await panel.getByText('게시 준비가 됐습니다.',{exact:true}).waitFor();
   await panel.screenshot({path:path.join(directory,'publish-panel-1440.png')});
   page.once('dialog',dialog=>dialog.accept());
   await panel.getByRole('button',{name:'게시하기',exact:true}).click();
   await page.getByText('게시했습니다.',{exact:false}).waitFor();
   assert.equal(room.showroom_status,'published');
   assert.equal(room.published_content._review.confirmed,true);
   result.passed.push('a draft publishes from the panel with one confirmation and no separate review step');

   if(errors.length)throw Error('Page errors: '+errors.join(' | '));
   if(unexpected.length)throw Error('Unexpected requests: '+unexpected.join(', '));
 }catch(error){result.failures.push(error instanceof Error?error.message:String(error));if(page)await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
