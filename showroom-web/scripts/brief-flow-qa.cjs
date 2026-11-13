/* Browser check for the three-step admin flow and the brief (기획서) check.
 * Uses the real admin handler with in-memory data; no AI provider is called. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001';
 let room={id:property,property_id:property,slug:'conflict-qa',showroom_status:'draft',revision:1,draft_content:{schema_version:'1.0',id:property,category:'commercial',title:'합성 상가 예시',subtitle:'처음 헤드라인',summary:'처음 요약입니다.',address:'합성 소재지',salesStrategy:{positioning:'역세권 테라스 상가',buyerSegments:[{label:'카페 창업자',rationale:'테라스 좌석 수요',sourceRefs:[{kind:'input_text'}]},{label:'학원 운영자',rationale:'학교 인접',sourceRefs:[{kind:'input_text'}]}],sellingPoints:[{fact:'테라스 20평',buyerBenefit:'야외 좌석 운영',sourceRefs:[{kind:'input_text',excerpt:'테라스 20평'}]},{fact:'역 도보 3분',buyerBenefit:'방문 편리',sourceRefs:[{kind:'input_text',excerpt:'역 3분'}]},{fact:'코너 자리',buyerBenefit:'가시성',sourceRefs:[{kind:'input_text'}]}],useScenarios:[],headlineVariants:[],materialConstraints:[{description:'권리금 조건 미확인',relatedClaim:'권리금'}],callToAction:'문의'},propertyProfile:{version:1,kind:'commercial',transaction:'sale',price:{status:'fixed',saleWon:300000000,depositWon:null,monthlyWon:null},fields:[{id:'initial-area',key:'exclusive_area',label:'전용면적',value:165.29,unit:'㎡',status:'provided',sourceText:'등록자 제공정보',sourceIds:[],useApproved:true,publication:'approved'}],sourcePermissions:[],highlights:[]},registration:{channel:'web',rightsApproved:true,contact:{name:'합성 담당자',phone:'010-0000-0000',publicApproved:true}},facts:[],concepts:[],unknowns:[],assets:[]}};let queued;
 const background=summary=>{room={...room,revision:room.revision+1,draft_content:{...room.draft_content,summary}};};
 const mockFetch=async(url,init={})=>{
   const pathname=String(url);
   if(pathname.endsWith('/rpc/copy_rewrite_queue')){queued=JSON.parse(init.body);return Response.json({id:queued.p_id,queued:true,state:'queued'});}
   if(pathname.includes('/property_copy_rewrites?'))return Response.json([]);
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
 const admin=createHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch,copyRewriteEnabled:true});
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,'../test-results/brief-flow');await fs.mkdir(directory,{recursive:true});
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
   const steps=page.getByRole('navigation',{name:'작업 단계',exact:true});
   // Analysis exists, so the listing opens on the brief check.
   await steps.getByRole('button',{name:'② 기획 확인',exact:true,pressed:true}).waitFor();
   const brief=page.locator('#brief-confirm');
   const factText=await brief.locator('.brief-facts').innerText();
   for(const value of ['합성 소재지','매매','3억 원 (300,000,000원)','165.29㎡ (50평)','합성 담당자 · 010-0000-0000'])assert.ok(factText.includes(value),value);
   assert.equal(await brief.getByLabel('타깃 고객',{exact:true}).inputValue(),'카페 창업자');
   assert.equal(await brief.locator('.brief-points > li').count(),3);
   await brief.getByRole('button',{name:'1번 장점 아래로',exact:true}).click();
   await brief.locator('.brief-points > li').nth(2).getByRole('button',{name:'빼기',exact:true}).click();
   await brief.getByLabel('친근하고 쉽게',{exact:true}).check();
   assert.equal(await brief.locator('h3 small').innerText(),'저장 전 수정 있음');
   await brief.screenshot({path:path.join(directory,'brief-confirm.png')});
   await brief.getByRole('button',{name:'이대로 진행 · 글 다시 쓰기',exact:true}).click();
   await page.getByText('기획서를 저장하고 글 다시 쓰기를 요청했습니다.',{exact:false}).waitFor();
   assert.deepEqual(room.draft_content.brief.points.map(p=>p.fact),['역 도보 3분','테라스 20평']);
   assert.equal(room.draft_content.brief.tone,'friendly');
   assert.deepEqual(queued.p_fields,['subtitle','summary','target_1_blog','target_2_blog','insta_caption']);
   assert.match(queued.p_instruction,/타깃 고객: 카페 창업자/);
   assert.match(queued.p_instruction,/1\) 역 도보 3분 → 방문 편리 2\) 테라스 20평/);
   assert.match(queued.p_instruction,/글 톤: 친근하고 쉽게/);
   await steps.getByRole('button',{name:'③ 미리보기·게시',exact:true,pressed:true}).waitFor();
   for(const id of ['#copy-rewrite','#publish-review','#showroom-draft'])await page.locator(id).waitFor();
   assert.equal(await page.locator('#image-settings').count(),0);
   result.passed.push('brief check proposes from analysis, edits order and tone, then saves and requests rewrites of all copy from it');
   await steps.getByRole('button',{name:'② 기획 확인',exact:true}).click();
   await brief.getByRole('button',{name:'사실정보 수정',exact:true}).click();
   await steps.getByRole('button',{name:'① 입력·자료',exact:true,pressed:true}).waitFor();
   await page.locator('#property-facts-editor').waitFor();
   await steps.getByRole('button',{name:'고급 편집 · 전체 패널',exact:true}).click();
   for(const id of ['#image-settings','#property-facts-editor','#publish-review','#copy-rewrite'])await page.locator(id).waitFor();
   result.passed.push('each step shows its panels; fact editing opens the input step; the full panel view keeps every panel');

   if(errors.length)throw Error('Page errors: '+errors.join(' | '));
   if(unexpected.length)throw Error('Unexpected requests: '+unexpected.join(', '));
 }catch(error){result.failures.push(error instanceof Error?error.message:String(error));if(page)await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
