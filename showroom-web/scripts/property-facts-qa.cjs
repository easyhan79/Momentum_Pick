/* Local browser integration using the real admin/public handlers with an
 * in-memory database. All nonlocal browser traffic is intercepted. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const {createPublicHandler}=await import('../../supabase/functions/public-showroom/index.ts');
 const {publicDto}=await import('../../supabase/functions/public-showroom/index.ts');
 const {createInquiryHandler}=await import('../../supabase/functions/showroom-inquiries/index.ts');
 const {createCrmHandler}=await import('../../supabase/functions/showroom-crm/index.ts');
 const {POLICY}=await import('../../supabase/functions/_shared/inquiries.ts');
 const v21Admin=process.env.V21_ADMIN_QA==='1';let inquiryStored;
 const property='10000000-0000-4000-8000-000000000001';
 const pdfMode=process.env.PDF_REVIEW_QA==='1';
 const rentalMode=process.env.RENTAL_SCENARIO_QA==='1';
 const copyReviewMode=process.env.COPY_REVIEW_QA==='1';
 const imagePromptMode=process.env.IMAGE_PROMPT_QA==='1';
 const customerRequestMode=process.env.CUSTOMER_REQUEST_QA==='1',inquiryInputs=[];
 const pdfFixture=pdfMode?JSON.parse(await fs.readFile(path.resolve(__dirname,'../test-results/v2-pdf/fixture.json'),'utf8')):null;
 const registrationMode=process.env.WEB_REGISTRATION_QA==='1'||pdfMode||v21Admin;let created=!registrationMode,queued=false;
 const queueInputs=[];
 const pdfDocuments=pdfMode?[{id:pdfFixture.assetId,caption:'합성 매각제안서',kind:'document',source_type:'owner_provided'},{id:pdfFixture.encryptedId,caption:'암호화된 합성 문서',kind:'document',source_type:'owner_provided'}]:[];
 const promptAssets=imagePromptMode?[{id:'20000000-0000-4000-8000-000000000002',property_id:property,kind:'photo',source_type:'owner_provided',caption:'합성 원본 사진'},{id:'30000000-0000-4000-8000-000000000003',property_id:property,kind:'provided_plan',source_type:'owner_provided',caption:'합성 제공 도면'}]:[];
 let documentMode='normal';
 let room={id:property,property_id:property,slug:'factory-qa',showroom_status:'draft',revision:1,draft_content:{schema_version:'1.0',id:property,category:'industrial',title:'합성 공장 예시',subtitle:'검토용 제목',summary:'합성 브라우저 검증 자료입니다.',address:'합성 소재지',facts:[],concepts:[],unknowns:[],assets:[]}};
 const legacySummary='[사실 조건] 토지 100㎡입니다. [제공 주장] 장기 임대 중입니다. [활용 가설] 계약 승계 가능 여부는 확인이 필요합니다.';
 const privateCopyReview=[{category:'provided_claim',statement:'합성 제공자 주장 검토 메모',check:'임대차계약서로 계약기간과 승계 조건을 대조하세요.'}];
 if(copyReviewMode){room.draft_content.summary=legacySummary;room.published_content={summary:'기존 승인 문구'};}
 if(imagePromptMode){room.draft_content.facts=[{key:'power_capacity',label:'전력 용량',value:0,unit:'kW',evidence:'owner_provided',source:'합성 제공자료'},{key:'private',label:'비공개 정보',value:'PRIVATE_VALUE',evidence:'owner_provided',publication:'private'}];room.draft_content.concepts=[{id:'concept-1',conceptName:'제조 운영 검토',headline:'활용 가설',rationale:'확인 필요',feasibility:'not_checked',zones:[{id:'zone-1-1',label:'작업',title:'작업 구역',body:'가설'}]}];room.published_content={summary:'기존 승인 문구'};}
 const mockFetch=async(url,init={})=>{
   const pathname=String(url);
   if(pathname.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
   if(pathname.endsWith('/rpc/crm_register_context_inquiry')){const args=JSON.parse(init.body);inquiryStored={id:'20000000-0000-4000-8000-000000000002',property_id:args.p_expected_property,...args.p_data};return Response.json({id:inquiryStored.id});}
   if(pathname.includes('/property_inquiries?'))return Response.json(inquiryStored?[inquiryStored]:[]);
   if(pathname.includes('/inquiry_activity?'))return Response.json([]);

   if(pathname.endsWith('/rpc/showroom_save_concept_draft')){const args=JSON.parse(init.body);room={...room,draft_content:args.p_content,revision:room.revision+1};return Response.json(room);}
   if(pathname.endsWith('/rpc/web_create_property')){const args=JSON.parse(init.body);room={...room,draft_content:{...args.p_content,id:property}};created=true;return Response.json({property_id:property,duplicate:false});}
   if(pathname.endsWith('/rpc/web_queue_analysis')){queueInputs.push(JSON.parse(init.body).p_raw);queued=true;return Response.json({queued:true,state:'waiting'});}
   if(pathname.includes('/property_web_intakes?'))return Response.json(created?[{property_id:property,state:queued?'queued':'draft'}]:[]);
   if(pathname.includes('/property_showrooms?')){
     if(init.method==='PATCH'){
       if(!pathname.includes('revision=eq.'+room.revision))return Response.json([]);
       room={...room,...JSON.parse(init.body)};
     }
     return Response.json([room]);
   }
   if(pdfMode&&pathname.includes('/property_assets?'))return Response.json(pdfDocuments.filter(doc=>!pathname.includes('id=in.')||pathname.includes(doc.id)));
   if(pdfMode&&pathname.includes('/property_analysis_jobs?'))return Response.json([{state:queueInputs.length===1?'failed':queued?'done':'waiting',attempts:queued?1:0,last_error_code:queueInputs.length===1?'document_pdf_encrypted':''}]);
   if(pdfMode&&pathname.includes('/properties?'))return Response.json(created?[{id:property,address:'합성 소재지',status:queueInputs.length>1?'analyzed':'pending',created_at:'2026-11-05T01:00:00Z',ai_contents:queueInputs.length>1?pdfFixture.ai:{}}]:[]);
   if(pathname.includes('/properties?'))return Response.json(created?[{id:property,address:'합성 소재지',status:registrationMode&&!queued?'pending':'analyzed',created_at:'2026-11-05T01:00:00Z',ai_contents:{...(copyReviewMode?{copy_review:privateCopyReview,usp_summary:legacySummary,target_1_blog:'[제공 주장] 장기 임대 중이며 승계는 별도 확인이 필요합니다.'}:{}),document_facts:registrationMode?[{key:'floor_structure',label:'층수',value:'지상 4층',unit:'',source_index:1,page:7,quote:'지상 4층',missing:false},{key:'floor_structure',label:'층수',value:'지상 3층',unit:'',source_index:1,page:8,quote:'지상 3층',missing:false}]:[],showroom_concepts:queued?[{concept_name:'생산시설 활용 검토',zone_plan:['작업 구역']}]:[]}}]:[]);
   if(['/property_assets?','/property_image_jobs?','/property_image_budgets?','/property_showroom_routes?','/property_analysis_jobs?'].some(p=>pathname.includes(p)))return Response.json([]);
   throw Error('Unexpected mock database request: '+pathname);
 };
 const admin=createHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch});
 const publicHandler=createPublicHandler('https://mock-db','synthetic-server-key',mockFetch);
 const inquiryHandler=createInquiryHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch});
 const crmHandler=createCrmHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch});
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,imagePromptMode?(process.env.SHOWROOM_QA_URL?'../test-results/image-prompts-built':'../test-results/image-prompts'):pdfMode?(process.env.SHOWROOM_QA_URL?'../test-results/v2-pdf-built':'../test-results/v2-pdf'):v21Admin?(process.env.SHOWROOM_QA_URL?'../test-results/v21-admin-built':'../test-results/v21-admin-journey'):copyReviewMode?'../test-results/v2-copy-review':customerRequestMode?'../test-results/v2-customer-inquiry':rentalMode?'../test-results/v2-rental':registrationMode?'../test-results/v2-registration':'../test-results/v2-facts');await fs.mkdir(directory,{recursive:true});
 const result={passed:[],failures:[]},errors=[],unexpected=[],promptMutations=[];
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let page;
 try{
   page=await browser.newPage({viewport:{width:1440,height:1000}});
   page.on('pageerror',error=>errors.push(error.message));
   page.on('console',message=>{if(message.type()==='error'&&message.text().includes('same key'))errors.push(message.text());});
   await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin===new URL(base).origin){
       if(url.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic-public-key'}});
       return route.continue();
     }
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, PATCH, OPTIONS','access-control-allow-headers':'*'}});
     if(url.pathname==='/auth/v1/token')return route.fulfill({json:{access_token:'synthetic-user',refresh_token:'synthetic-refresh',expires_in:3600}});
     if(url.pathname==='/functions/v1/showroom-inquiries'&&request.method()==='GET'&&url.searchParams.get('action')==='policy')return route.fulfill({json:{policy:POLICY}});
     if(url.pathname==='/functions/v1/showroom-inquiries'&&request.method()==='POST'){inquiryInputs.push(JSON.parse(request.postData()));if(v21Admin){const response=await inquiryHandler(new Request(request.url(),{method:'POST',headers:{'content-type':'application/json'},body:request.postData()}));return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}});}return route.fulfill({status:202,json:{accepted:true}});}
     if(url.pathname==='/functions/v1/showroom-assets'){
       if(pdfMode&&url.searchParams.get('action')==='document'){
         if(documentMode==='denied')return route.fulfill({status:403,json:{error:'admin_required'}});
         if(documentMode==='corrupt')return route.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.7\ncorrupt synthetic')});
         if(documentMode==='changed')return route.fulfill({contentType:'application/pdf',body:Buffer.concat([Buffer.from(pdfFixture.pdfBase64,'base64'),Buffer.from('\nchanged')])});
         if(documentMode==='interactive')return route.fulfill({contentType:'application/pdf',body:Buffer.from(pdfFixture.interactiveBase64,'base64')});
         const encrypted=url.searchParams.get('assetId')===pdfFixture.encryptedId;
         return route.fulfill({contentType:'application/pdf',body:Buffer.from(encrypted?pdfFixture.encryptedBase64:pdfFixture.pdfBase64,'base64')});
       }
       return route.fulfill({json:{assets:imagePromptMode?promptAssets:pdfDocuments}});
     }
     if(url.pathname==='/functions/v1/showroom-admin'){
       if(imagePromptMode&&request.method()!=='GET')promptMutations.push(JSON.parse(request.postData()).action);
       const response=await admin(new Request(request.url(),{method:request.method(),headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},...(request.postData()?{body:request.postData()}:{})}));
       return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
     }
     if(url.pathname==='/functions/v1/public-showroom'){
       const response=await publicHandler(new Request(request.url()));
       return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}});
     }
     unexpected.push(url.pathname);return route.abort();
   });
   await page.goto(base+'/admin');
   await page.getByLabel('이메일',{exact:true}).fill('qa@example.invalid');
   await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password-123');
   await page.getByRole('button',{name:'로그인',exact:true}).click();
   if(registrationMode){
     await page.getByRole('button',{name:'새 매물 입력',exact:true}).click();
     const form=page.locator('#new-property');
     await form.getByLabel('매물 유형',{exact:true}).selectOption('factory');
     await form.getByLabel('등록 거래방식',{exact:true}).selectOption('sale');
     await form.getByLabel('매물명',{exact:true}).fill('합성 공장 예시');
     await form.getByLabel('소재지',{exact:true}).fill('합성 소재지');
     await form.getByLabel('확인 가능한 면적 · ㎡',{exact:true}).fill('100');
     await form.getByLabel('등록 가격 상태',{exact:true}).selectOption('negotiable');
     await form.getByLabel('담당자 이름',{exact:true}).fill('합성 담당자');
     await form.getByLabel('업무용 연락처',{exact:true}).fill('010-0000-0000');
     await form.getByLabel('이 담당자 정보의 고객 공개에 동의합니다. 공개 전 필수입니다.').check();
     await form.getByLabel('입력 정보와 자료를 사용할 권한을 확인했습니다. AI 분석 전 필수입니다.').check();
     await form.getByRole('button',{name:'비공개 임시 저장',exact:true}).click();
     await page.locator('#property-facts-editor').waitFor();
     assert.ok(created);assert.equal(room.draft_content.registration.channel,'web');
     await page.getByRole('button',{name:'저장 후 AI 분석 요청',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('대기열'));
     assert.ok(queued);
     result.passed.push('new property form -> private draft -> explicit analysis queue');
     if(pdfMode){
       const docs=page.locator('#document-review');
       await docs.getByRole('button',{name:'추출 후보 새로고침',exact:true}).click();
       await docs.getByText(/암호화된 PDF입니다/).waitFor();
       await docs.getByLabel('암호화된 합성 문서',{exact:true}).uncheck();
       await page.getByRole('button',{name:'저장 후 AI 분석 요청',exact:true}).click();
       await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('대기열'));
       assert.equal(queueInputs.length,2);assert.ok(queueInputs[0].includes(pdfFixture.encryptedId));assert.ok(!queueInputs[1].includes(pdfFixture.encryptedId));assert.ok(queueInputs[1].includes(pdfFixture.assetId));
       assert.deepEqual(room.draft_content.registration.analysisDocumentIds,[pdfFixture.assetId]);
       await docs.getByRole('button',{name:'추출 후보 새로고침',exact:true}).click();
       await docs.getByText('첨부 1 · PDF 3쪽',{exact:true}).waitFor();
       assert.equal(await docs.locator('.evidence-tag').getByText('원문 문구 일치 · 내용은 미검증',{exact:true}).count(),2);
       assert.equal(await docs.locator('.evidence-tag').getByText('인용문에 추출값이 없음',{exact:true}).count(),1);
       assert.equal(await docs.locator('.evidence-tag').getByText('PDF 페이지 번호 불일치',{exact:true}).count(),1);
       assert.match(await docs.innerText(),/텍스트 없는 페이지: 3쪽/);
       const comparison=docs.getByRole('button',{name:'해당 원문 페이지 대조',exact:true});
       const viewer=page.locator('#private-pdf-viewer');
       const rendered=async number=>{await page.waitForFunction(n=>document.querySelector('#private-pdf-viewer canvas')?.getAttribute('data-rendered-page')===String(n),number);};
       await comparison.nth(1).click();await rendered(2);
       await viewer.locator('summary').click();
       assert.match(await viewer.locator('.pdf-page-text').innerText(),/지상 3층/);
       assert.match(await viewer.locator('.pdf-candidate').innerText(),/지상 3층/);
       assert.ok(await viewer.locator('canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<200&&pixels[i+1]<200&&pixels[i+2]<200)ink++;return ink>100;}));
       await viewer.getByLabel('원문 확대',{exact:true}).selectOption('150');await rendered(2);
       await viewer.getByRole('button',{name:'다음 쪽',exact:true}).click();await rendered(3);
       assert.match(await viewer.innerText(),/추출 가능한 텍스트가 없습니다/);
       assert.ok(await viewer.locator('canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<150&&pixels[i+1]<150&&pixels[i+2]<150)ink++;return ink>100;}));
       for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await rendered(3);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
       await viewer.screenshot({path:path.join(directory,'viewer-scanned.png')});
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       assert.equal(await viewer.count(),0);await comparison.nth(4).click();await rendered(1);
       assert.match(await viewer.innerText(),/99쪽은 원본 3쪽 범위를 벗어납니다/);
       await viewer.getByLabel('원문 페이지',{exact:true}).fill('2');await viewer.getByRole('button',{name:'페이지 이동',exact:true}).click();await rendered(2);
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).press('Escape');assert.equal(await viewer.count(),0);
       assert.equal(await comparison.nth(4).evaluate(el=>el===document.activeElement),true);
       await docs.getByRole('button',{name:'원문 페이지 보기',exact:true}).nth(1).click();
       await viewer.getByRole('alert').getByText(/암호화된 PDF는 화면에서 열 수 없습니다/).waitFor();
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       documentMode='changed';await comparison.nth(0).click();
       await viewer.getByRole('alert').getByText(/분석 당시 원본과 현재 파일이 다릅니다/).waitFor();
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       documentMode='corrupt';await docs.getByRole('button',{name:'원문 페이지 보기',exact:true}).first().click();
       await viewer.getByRole('alert').getByText(/PDF를 표시하지 못했습니다/).waitFor();
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       documentMode='denied';await docs.getByRole('button',{name:'원문 페이지 보기',exact:true}).first().click();
       await viewer.getByRole('alert').waitFor();
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       documentMode='interactive';await docs.getByRole('button',{name:'원문 페이지 보기',exact:true}).first().click();await rendered(1);
       assert.equal(await page.evaluate(()=>globalThis.__PDF_SCRIPT_RAN__),undefined);
       assert.equal(await viewer.getByRole('link').count(),0);
       await viewer.getByRole('button',{name:'원문 보기 닫기',exact:true}).click();
       documentMode='normal';
       assert.equal(room.draft_content.propertyProfile.fields.length,1);assert.equal(room.published_content,undefined);
       assert.equal(await docs.getByLabel('원문 대조 대상으로 선택',{exact:true}).nth(0).isChecked(),false);
       result.passed.push('private PDF viewer renders Korean/scanned pages, navigates and zooms at 375/768/1440; keyboard closes and restores focus');
       result.passed.push('invalid candidate page, encrypted/corrupt/forbidden PDF and changed source digest are explicit; viewing never imports or publishes');
       result.passed.push('embedded PDF JavaScript and URI actions remain inactive; no external viewer or document requests');
       const downloaded=page.waitForEvent('download');
       await docs.getByRole('button',{name:'원본 PDF 받기',exact:true}).first().click();
       const file=await downloaded;const bytes=await fs.readFile(await file.path());
       assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),pdfFixture.pdfSha256);
       await docs.getByLabel('원문 대조 대상으로 선택',{exact:true}).nth(0).check();
       await docs.getByRole('button',{name:'선택 항목을 비공개 초안으로 가져오기',exact:true}).click();
       await docs.getByText(/선택한 항목을 비공개 사실정보로 가져왔습니다/).waitFor();
       const imported=room.draft_content.propertyProfile.fields.find(f=>f.key==='floor_structure');assert.equal(imported.publication,'private');assert.equal(imported.status,'provided');assert.deepEqual(imported.sourceIds,[pdfFixture.assetId]);
       assert.equal(room.draft_content.documentReview.entries[0].sourceCheck,'quote_matched');
       for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
       await docs.screenshot({path:path.join(directory,'review.png')});
       result.passed.push('encrypted PDF notice -> exclude without deleting -> save and retry selected PDF');
       result.passed.push('real synthetic PDF text checks: matched quote, fabricated value, invalid page, scanned page');
       result.passed.push('original PDF download digest and imported private provenance; widths 375/768/1440');
       assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);return;
     }
   }
   await page.getByRole('button',{name:'초안 열기',exact:true}).click();await page.getByRole('button',{name:'고급 편집 · 전체 패널',exact:true}).click();/* these checks cover every panel */
   if(imagePromptMode){
     const before=structuredClone(room),panel=page.locator('#image-prompt-panel'),settings=page.locator('#image-settings');
     const output=panel.getByLabel('Gemini 웹용 완성 프롬프트',{exact:true}),copy=panel.getByRole('button',{name:'이미지 프롬프트 복사',exact:true});
     await output.waitFor();let prompt=await output.inputValue();assert.match(prompt,/대표 이미지/);assert.match(prompt,/전력 용량: 0 kW/);assert.doesNotMatch(prompt,/PRIVATE_VALUE/);
     await panel.getByLabel('이미지 프롬프트 대상',{exact:true}).selectOption('concept-1');assert.match(await output.inputValue(),/x=27%, y=28%/);
     await panel.getByLabel('이미지 프롬프트 작업 방식',{exact:true}).selectOption('edit');await panel.getByLabel('원하는 이미지 변경 · 선택',{exact:true}).fill('구조를 유지하고 외벽 색감만 회색으로 변경');
     prompt=await output.inputValue();assert.match(prompt,/수정할 AI 이미지/);assert.match(prompt,/외벽 색감만/);assert.match(prompt,/실제 원본을 우선/);
     result.passed.push('hero/concept generation and edit prompts use current draft; zero is preserved, private values excluded, zones and structural constraints retained');
     await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});await copy.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),prompt);
     const downloading=page.waitForEvent('download');await panel.getByRole('button',{name:'이미지 프롬프트 내려받기',exact:true}).click();const download=await downloading;await download.saveAs(path.join(directory,'synthetic-prompt.txt'));const downloaded=await fs.readFile(path.join(directory,'synthetic-prompt.txt'),'utf8');assert.ok(downloaded.includes(prompt));assert.doesNotMatch(downloaded,/PRIVATE_VALUE|20000000|30000000/);
     result.passed.push('browser clipboard and UTF-8 text download contain matching prompt and no internal IDs or private numbers');
     await settings.getByRole('button',{name:'이미지 생성 방식 설정',exact:true}).click();await settings.getByLabel('이미지 유형',{exact:true}).selectOption('photo');assert.equal(await copy.isDisabled(),true);
     await settings.getByLabel('참고할 실제 자료',{exact:true}).selectOption(promptAssets[0].id);assert.equal(await copy.isDisabled(),true);
     await settings.getByLabel('선택 자료를 AI 제작에 사용할 권한을 확인했습니다.',{exact:true}).check();assert.equal(await copy.isEnabled(),true);assert.match(await output.inputValue(),/카메라 위치·시점/);
     await settings.getByLabel('이미지 유형',{exact:true}).selectOption('plan');assert.equal(await copy.isDisabled(),true);await settings.getByLabel('참고할 실제 자료',{exact:true}).selectOption(promptAssets[1].id);await settings.getByLabel('선택 자료를 AI 제작에 사용할 권한을 확인했습니다.',{exact:true}).check();assert.match(await output.inputValue(),/도면에서 확인되는 벽·기둥·출입구/);
     result.passed.push('reference mode requires selected photo/plan and explicit rights; mode changes cannot reuse stale source permission');
     for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await panel.screenshot({path:path.join(directory,`prompt-${width}.png`)});}
     assert.deepEqual(room,before);assert.deepEqual(promptMutations,['create-draft']);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
     result.passed.push('375/768/1440, no page/console errors, no image/AI job or budget mutation, saved draft and approval unchanged by prompt controls');return;
   }
   if(copyReviewMode){
     const summary=page.getByLabel('요약 · AI 문구 검토 필요',{exact:true});
     await summary.waitFor();assert.equal(await summary.inputValue(),legacySummary);
     const panel=page.locator('.copy-review-panel');await panel.getByText(privateCopyReview[0].statement,{exact:true}).waitFor();
     assert.match(await panel.innerText(),/제공자 주장 · 미검증/);
     result.passed.push('private structured review appears only in the admin studio; original draft is unchanged on open');
     await page.getByRole('button',{name:'요약의 구분표시 정리',exact:true}).click();
     const edited=await summary.inputValue();assert.doesNotMatch(edited,/\[(사실 조건|제공 주장|활용 가설)\]/);
     assert.match(edited,/100㎡/);assert.match(edited,/제공자 설명에 따르면/);assert.match(edited,/계약 승계 가능 여부는 확인이 필요/);
     assert.equal(room.draft_content.summary,legacySummary);
     await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('저장했습니다'));
     assert.equal(room.draft_content.summary,edited);assert.deepEqual(room.published_content,{summary:'기존 승인 문구'});
     result.passed.push('explicit formatting preserves numbers/qualifications and requires save; published snapshot stays unchanged');
     await page.getByRole('button',{name:'선택 문구의 구분표시 정리',exact:true}).click();
     assert.equal(room.draft_content.marketing,undefined);
     await page.getByRole('button',{name:'광고 초안 저장',exact:true}).click();
     await page.getByText('광고 초안을 비공개로 저장했습니다.',{exact:true}).waitFor();
     assert.equal(room.draft_content.marketing.target_1_blog,'제공자 설명에 따르면 장기 임대 중이며 승계는 별도 확인이 필요합니다.');
     assert.deepEqual(room.published_content,{summary:'기존 승인 문구'});
     result.passed.push('legacy blog/card channel formatting is explicit, preserves conditions and saves only private marketing edits');
     await page.getByRole('button',{name:'쇼룸 미리보기',exact:true}).click();
     assert.equal(await page.locator('.copy-review-panel').count(),0);
     assert.equal(await page.locator('.hero-description').innerText(),edited);
     assert.equal((await page.locator('body').innerText()).includes(privateCopyReview[0].statement),false);
     for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
     await page.locator('.hero').screenshot({path:path.join(directory,'customer-summary.png')});
     result.passed.push('customer preview shows natural prose and omits private review at 375/768/1440');
     await page.getByRole('button',{name:'← 초안 편집으로 돌아가기',exact:true}).click();
     await page.getByRole('button',{name:'저장본 다시 불러오기',exact:true}).click();
     assert.equal(await summary.inputValue(),edited);
     assert.equal(await page.getByRole('button',{name:'요약의 구분표시 정리',exact:true}).isDisabled(),true);
     await panel.getByText(privateCopyReview[0].statement,{exact:true}).waitFor();
     await panel.screenshot({path:path.join(directory,'admin-review.png')});
     result.passed.push('saved edits survive reload; original AI review remains separate and no repeated formatting is offered');
     assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);return;
   }
   if(registrationMode&&!v21Admin){
     await page.getByRole('button',{name:'완료된 AI 활용 콘셉트 가져오기',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('콘셉트를 비공개'));
     assert.equal(room.draft_content.concepts.length,1);assert.equal(room.draft_content.propertyProfile.fields[0].value,100);
     assert.equal(room.published_content,undefined);
     result.passed.push('reopen web draft and import analyzed concepts without publishing or overwriting facts');
     const concepts=page.locator('#concepts-editor');
     await concepts.getByRole('button',{name:'활용 콘셉트 추가',exact:true}).click();
     const second=concepts.locator('fieldset').nth(1);
     await second.getByLabel('콘셉트명',{exact:true}).fill('별도 보관 활용 검토');
     await second.getByRole('button',{name:'위로 이동',exact:true}).click();
     await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('저장했습니다'));
     assert.equal(room.draft_content.concepts[0].id,'concept-2');
     assert.equal(room.draft_content.concepts[0].conceptName,'별도 보관 활용 검토');
     await concepts.locator('fieldset').nth(1).getByRole('button',{name:'콘셉트 삭제',exact:true}).click();
     await page.getByRole('button',{name:'이미지 생성 방식 설정',exact:true}).click();
     await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('저장했습니다'));
     assert.equal(room.draft_content.concepts.length,1);assert.equal(room.draft_content.imageSettings.mode,'concept');
     result.passed.push('concept add/reorder/delete and explicit image mode saved through validated handlers');
     const documents=page.locator('#document-review');
     await documents.getByText(/서로 다른 값이 추출됐습니다/).waitFor();
     await documents.getByLabel('원문 대조 대상으로 선택',{exact:true}).nth(0).check();
     await documents.getByLabel('원문 대조 대상으로 선택',{exact:true}).nth(1).check();
     await documents.getByRole('button',{name:'선택 항목을 비공개 초안으로 가져오기',exact:true}).click();
     await documents.getByText(/선택한 항목을 비공개 사실정보로 가져왔습니다/).waitFor();
     const extracted=room.draft_content.propertyProfile.fields.filter(f=>f.key==='floor_structure');
     assert.equal(extracted.length,2);assert.ok(extracted.every(f=>f.publication==='private'&&!f.useApproved));
     assert.equal(room.published_content,undefined);
     result.passed.push('document conflict display and selected candidate import remain private/unverified');
     assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
     return;
   }
   if(v21Admin){
     await page.getByRole('button',{name:'완료된 AI 활용 콘셉트 가져오기',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('콘셉트를 비공개'));
     for(const key of ['power_capacity','clear_height']){await page.locator('#property-facts-editor').getByLabel('추가할 정보 항목',{exact:true}).selectOption(key);await page.getByRole('button',{name:'정보 항목 추가',exact:true}).click();}
   }else await page.getByRole('button',{name:'사실정보 편집 시작',exact:true}).click();
   assert.equal(await page.locator('#property-facts-editor').count(),1);
   const editor=page.locator('#property-facts-editor');
   await editor.getByLabel('세부 유형',{exact:true}).selectOption('factory');
   await editor.getByLabel('거래방식',{exact:true}).selectOption('sale');
   await editor.getByLabel('가격 상태',{exact:true}).selectOption('negotiable');
   const area=editor.locator('.fact-editor-field').first();
   await area.getByLabel('값 단위',{exact:true}).selectOption('sqm'); // area defaults to 평; this case enters ㎡ directly
   await area.getByLabel('값',{exact:true}).fill('100');
   await area.getByLabel('정보 상태',{exact:true}).selectOption('provided');
   await area.getByLabel('공개할 출처 설명 · 개인정보 제외',{exact:true}).fill('합성 소유자 제공자료');
   await area.getByLabel('이 정보와 근거자료를 사용할 권한을 확인했습니다.').check();
   await area.getByLabel('값 공개 범위',{exact:true}).selectOption('approved');
   const power=editor.locator('.fact-editor-field').filter({has:page.locator('legend',{hasText:'전력 용량'})});
   await power.getByLabel('값',{exact:true}).fill('0');
   await power.getByLabel('정보 상태',{exact:true}).selectOption('provided');
   await power.getByLabel('공개할 출처 설명 · 개인정보 제외',{exact:true}).fill(v21Admin?'합성 수전 제공자료':'PRIVATE_SOURCE');
   if(v21Admin){
     await power.getByLabel('정보 기준일 · 선택',{exact:true}).fill('2026-11-01');
     await power.getByLabel('이 정보와 근거자료를 사용할 권한을 확인했습니다.').check();
     await power.getByLabel('값 공개 범위',{exact:true}).selectOption('approved');
     const height=editor.locator('.fact-editor-field').filter({has:page.locator('legend',{hasText:'층고'})});
     await height.getByLabel('값',{exact:true}).fill('10');await height.getByLabel('정보 상태',{exact:true}).selectOption('provided');await height.getByLabel('공개할 출처 설명 · 개인정보 제외',{exact:true}).fill('PRIVATE_SOURCE');
     const decision=page.locator('#decision-settings-editor');await decision.getByRole('button',{name:'판단 카드 초안 준비',exact:true}).click();
     await decision.getByLabel('목적 표시 이름 · 제조 운영',{exact:true}).fill('합성 제조 운영 검토');
     await decision.getByLabel('판단 카드 공개 범위',{exact:true}).selectOption('approved');
     await decision.getByLabel('근거·기준일·제약·확인사항을 검토했습니다. 이 확인은 사실 검증이나 허가 확정이 아닙니다.',{exact:true}).check();
     const concepts=page.locator('#concepts-editor');await concepts.getByLabel('제조 운영',{exact:true}).check();
     assert.equal(room.published_content,undefined);
   }
   await editor.getByRole('button',{name:'검토 이유 추가',exact:true}).click();
   const highlight=editor.locator('.property-highlights-editor fieldset').first();
   await highlight.getByLabel('검토 이유 제목',{exact:true}).fill('제공 면적 검토');
   await highlight.getByLabel('설명',{exact:true}).fill('공개 가능한 면적 자료를 검토합니다.');
   const fieldId=await highlight.getByLabel('연결할 근거정보',{exact:true}).locator('option').filter({hasText:'토지면적'}).getAttribute('value');
   await highlight.getByLabel('연결할 근거정보',{exact:true}).selectOption(fieldId);
   await highlight.getByLabel('제약·확인사항',{exact:true}).fill('실측 및 공부 대조 필요');
   if(rentalMode){
     await editor.getByRole('button',{name:'임대 가정 계산 추가',exact:true}).click();
     const rental=page.locator('#rental-scenario-editor');
     assert.equal(await rental.getByLabel('매입가 입력',{exact:true}).inputValue(),'');
     assert.match(await rental.innerText(),/계산 준비에 필요한 입력/);
     await rental.getByLabel('매입가 입력',{exact:true}).fill('1000000000');
     await rental.getByLabel('연간 임대료 입력',{exact:true}).fill('60000000');
     await rental.getByLabel('연간 운영비 입력',{exact:true}).fill('12000000');
     await rental.getByLabel('공실률 가정 입력',{exact:true}).fill('10');
     await rental.getByLabel('연간 임대료 근거',{exact:true}).selectOption('provided');
     await rental.getByLabel('연간 임대료 출처',{exact:true}).fill('합성 임대자료 · 미검증');
     assert.equal(await rental.getByLabel('계산 공개 범위',{exact:true}).inputValue(),'private');
     assert.match(await rental.innerText(),/42,000,000원 · 입력 매입가 대비 4.20%/);
   }
   await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('저장했습니다'));
   assert.equal(room.draft_content.propertyProfile.fields.find(f=>f.key==='land_area').value,100);
   assert.equal(room.draft_content.propertyProfile.fields.find(f=>f.key==='power_capacity').value,0);
   result.passed.push('admin edits and saves numeric values, sources, rights, private zero');
   if(rentalMode){
     assert.equal(room.draft_content.propertyProfile.modules.rentalScenario.vacancyBps.value,1000);
     assert.equal(publicDto(room.draft_content).rentalScenario,undefined);
     result.passed.push('optional rental inputs start empty and private; real public projection excludes unapproved assumptions');
   }
   await page.getByRole('button',{name:'쇼룸 미리보기',exact:true}).click();
   await page.getByText('비공개 항목 · 초안에서만 표시',{exact:true}).first().waitFor();
   if(rentalMode)await page.locator('#rental-scenario').getByText('관리자 초안 미리보기 · 비공개 · 실제 수익률·감정평가가 아닙니다.',{exact:true}).waitFor();
   await page.getByRole('button',{name:'← 초안 편집으로 돌아가기',exact:true}).click();
   if(rentalMode){
     await page.getByLabel('계산 공개 범위',{exact:true}).selectOption('approved');
     await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();
     await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('저장했습니다'));
   }
   // Publishing is one button plus one confirmation dialog (no review step, checkboxes or memo).
   page.once('dialog',dialog=>{assert.match(dialog.message(),/주소·거래조건·가격·면적·담당자 연락처/);void dialog.accept();});
   await page.getByRole('button',{name:'게시하기',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent?.includes('게시했습니다'));
   assert.equal(room.published_content.propertyProfile.fields.length,v21Admin?3:12);
   if(v21Admin){assert.ok(room.published_content.customerDecision);assert.equal(room.published_content.customerDecision.engineVersion,'provided-rules-v1');}
   result.passed.push('review and publication via real handler with in-memory data');
   for(const width of [375,768,1440]){
     await page.setViewportSize({width,height:1000});
     const sizes=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}));
     assert.ok(sizes.scroll<=sizes.inner,'admin overflow at '+width);
   }
   await page.goto(base+'/factory-qa');
   await page.locator('#facts').waitFor();
   assert.match(await page.locator('#facts').innerText(),/100/);
   assert.doesNotMatch(await page.locator('#facts').innerText(),/PRIVATE_SOURCE/);
   assert.match(await page.locator('#property-overview').innerText(),/제공 면적 검토/);
   assert.match(await page.locator('#property-overview').innerText(),/실측 및 공부 대조 필요/);
   assert.match(await page.locator('#property-overview').innerText(),/가격 협의/);
   assert.match(await page.locator('#property-location').innerText(),/합성 소재지/);
   if(v21Admin){
     await page.getByLabel('고객 목적 선택',{exact:true}).selectOption('factory-manufacturing');
     await page.locator('#customer-purpose').getByLabel('전력 용량 확인 요청',{exact:true}).check();
     assert.match(await page.locator('#decision-cards').innerText(),/2026-11-01/);assert.match(await page.locator('#decision-cards').innerText(),/0 또는 음수/);
     await page.getByLabel('성함',{exact:true}).fill('합성 확인 요청자');await page.getByLabel('연락처',{exact:true}).fill('01000000000');await page.getByLabel('관심 활용·상담 주제',{exact:true}).fill('전력 조건 확인');await page.getByLabel('문의 내용 · 선택',{exact:true}).fill('합성 추가 메모');await page.getByLabel('개인정보 수집·이용에 동의합니다. (필수)',{exact:true}).check();
     await page.getByRole('button',{name:'문의 접수',exact:true}).click();await page.getByRole('heading',{name:'문의가 접수되었습니다.',exact:true}).waitFor();
     assert.equal(inquiryInputs.length,1);assert.equal(inquiryStored.property_id,property);assert.match(inquiryStored.memo,/합성 제조 운영 검토/);assert.match(inquiryStored.memo,/need-power_capacity/);assert.doesNotMatch(inquiryStored.memo,/PRIVATE_SOURCE/);
     const crmResponse=await crmHandler(new Request('https://x.test?action=detail&id='+inquiryStored.id,{headers:{Authorization:'Bearer synthetic-admin'}}));assert.equal(crmResponse.status,200);assert.equal((await crmResponse.json()).inquiry.memo,inquiryStored.memo);
     const frozen=structuredClone(room.published_content),edits=structuredClone(room.draft_content);edits.propertyProfile.fields.find(f=>f.key==='power_capacity').value=200;
     const saved=await admin(new Request('https://x.test',{method:'PATCH',headers:{Authorization:'Bearer synthetic-admin'},body:JSON.stringify({action:'save-draft',propertyId:property,revision:room.revision,edits})}));assert.equal(saved.status,200);assert.deepEqual(room.published_content,frozen);assert.equal(room.draft_content.propertyProfile.modules.customerDecision.reviewedBy,undefined);
     assert.equal(publicDto(room.published_content).customerDecision.cards.find(c=>c.slotKey==='power_capacity').references[0].value,0);
     result.passed.push('new web registration -> analysis queue -> edited sourced facts/concept purpose -> private analysis review -> approved frozen report -> customer power request -> real inquiry/CRM handlers; later draft edit preserves approval');
   }
   if(customerRequestMode){
     await page.locator('#evidence input[type="checkbox"]').nth(0).check();
     await page.locator('#evidence input[type="checkbox"]').nth(1).check();
     assert.match(await page.getByLabel('선택한 확인·자료 요청',{exact:true}).innerText(),/2건/);
     await page.getByLabel('성함',{exact:true}).fill('합성 문의자');
     await page.getByLabel('연락처',{exact:true}).fill('010-0000-0000');
     await page.getByLabel('관심 활용·상담 주제',{exact:true}).fill('생산시설 검토');
     await page.getByLabel('문의 내용 · 선택',{exact:true}).fill('입주 시점도 확인해 주세요.');
     await page.getByLabel('개인정보 수집·이용에 동의합니다. (필수)',{exact:true}).check();
     await page.getByRole('button',{name:'문의 접수',exact:true}).click();
     await page.getByRole('heading',{name:'문의가 접수되었습니다.',exact:true}).waitFor();
     assert.equal(inquiryInputs.length,1);assert.match(inquiryInputs[0].memo,/\[확인·자료 요청\]/);
     assert.match(inquiryInputs[0].memo,/층별 도면/);assert.match(inquiryInputs[0].memo,/입주 시점도 확인해 주세요/);
     assert.ok(inquiryInputs[0].memo.length<=2000);assert.equal(inquiryInputs[0].slug,'factory-qa');
     result.passed.push('customer-selected materials and typed memo reach the existing inquiry payload together; one mocked submission');
   }
   if(rentalMode){
     const rental=page.locator('#rental-scenario'),results=rental.getByRole('definition');
     assert.match(await rental.innerText(),/관리자 승인 가정값/);
     assert.match(await rental.getByLabel('임대 가정 계산 결과',{exact:true}).innerText(),/4.20%/);
     await rental.locator('summary').click();
     assert.match(await rental.innerText(),/합성 임대자료 · 미검증/);
     await rental.getByLabel('공실률 가정 입력',{exact:true}).fill('100');
     assert.match(await rental.getByLabel('임대 가정 계산 결과',{exact:true}).innerText(),/-12,000,000원/);
     assert.match(await rental.getByLabel('임대 가정 계산 결과',{exact:true}).innerText(),/-1.20%/);
     assert.equal(room.published_content.propertyProfile.modules.rentalScenario.vacancyBps.value,1000);
     await rental.getByLabel('매입가 입력',{exact:true}).fill('');
     assert.equal(await rental.getByLabel('임대 가정 계산 결과',{exact:true}).count(),0);
     await rental.getByRole('button',{name:'처음 가정값으로 복원',exact:true}).click();
     assert.equal(await rental.getByLabel('공실률 가정 입력',{exact:true}).inputValue(),'10');
     assert.match(await rental.getByLabel('임대 가정 계산 결과',{exact:true}).innerText(),/4.20%/);
     result.passed.push('approved rental module, source disclosure, visitor full-vacancy loss/missing input/reset; published baseline preserved');
   }
   for(const width of [375,768,1440]){
     await page.setViewportSize({width,height:1000});
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   result.passed.push('evidence-linked highlights, negotiable price and location; public widths 375/768/1440');
   await page.screenshot({path:path.join(directory,'public-1440.png'),fullPage:true});
   result.passed.push('public approved value visible; private source absent; admin widths 375/768/1440');
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 }catch(error){result.failures.push(String(error.stack));result.pageErrors=errors;if(page){try{await fs.writeFile(path.join(directory,'failure.html'),await page.content());await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true});}catch(capture){result.failures.push('Failure capture: '+capture.message);}}process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
