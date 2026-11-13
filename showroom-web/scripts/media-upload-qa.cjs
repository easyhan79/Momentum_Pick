/* Browser check for multi-file, drag-and-drop uploads with browser-side resizing.
 * Uses the real admin handler with in-memory data; uploads are captured, not stored. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001';
 let room={id:property,property_id:property,slug:'conflict-qa',showroom_status:'draft',revision:1,draft_content:{schema_version:'1.0',id:property,category:'commercial',title:'합성 상가 예시',subtitle:'처음 헤드라인',summary:'처음 요약입니다.',address:'합성 소재지',salesStrategy:{positioning:'역세권 테라스 상가',buyerSegments:[{label:'카페 창업자',rationale:'테라스 좌석 수요',sourceRefs:[{kind:'input_text'}]},{label:'학원 운영자',rationale:'학교 인접',sourceRefs:[{kind:'input_text'}]}],sellingPoints:[{fact:'테라스 20평',buyerBenefit:'야외 좌석 운영',sourceRefs:[{kind:'input_text',excerpt:'테라스 20평'}]},{fact:'역 도보 3분',buyerBenefit:'방문 편리',sourceRefs:[{kind:'input_text',excerpt:'역 3분'}]},{fact:'코너 자리',buyerBenefit:'가시성',sourceRefs:[{kind:'input_text'}]}],useScenarios:[],headlineVariants:[],materialConstraints:[{description:'권리금 조건 미확인',relatedClaim:'권리금'}],callToAction:'문의'},propertyProfile:{version:1,kind:'commercial',transaction:'sale',price:{status:'fixed',saleWon:300000000,depositWon:null,monthlyWon:null},fields:[{id:'initial-area',key:'exclusive_area',label:'전용면적',value:165.29,unit:'㎡',status:'provided',sourceText:'등록자 제공정보',sourceIds:[],useApproved:true,publication:'approved'}],sourcePermissions:[],highlights:[]},registration:{channel:'web',rightsApproved:true,contact:{name:'합성 담당자',phone:'010-0000-0000',publicApproved:true}},facts:[],concepts:[],unknowns:[],assets:[]}};let queued,imageJobs=[];const imageRequests=[],uploads=[];
 const background=summary=>{room={...room,revision:room.revision+1,draft_content:{...room.draft_content,summary}};};
 const mockFetch=async(url,init={})=>{
   const pathname=String(url);
   if(pathname.endsWith('/rpc/copy_rewrite_queue')){queued=JSON.parse(init.body);return Response.json({id:queued.p_id,queued:true,state:'queued'});}
   if(pathname.includes('/property_copy_rewrites?'))return Response.json(queued?[{id:queued.p_id,property_id:property,base_revision:queued.p_revision,fields:queued.p_fields,instruction:queued.p_instruction,state:'queued',attempts:0,last_error_code:'',original:{},result:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}]:[]);
   if(pathname.endsWith('/rpc/image_enqueue')){const args=JSON.parse(init.body);imageRequests.push(args.p_slot);imageJobs=[{id:'40000000-0000-4000-8000-00000000000'+imageRequests.length,property_id:property,slot:args.p_slot,state:'queued',attempts:0,last_error_code:'',usage:{}}];return Response.json(imageJobs[0]);}
   if(pathname.endsWith('/rpc/image_sync_assets'))return Response.json({});
   if(pathname.includes('/property_image_jobs?'))return Response.json(imageJobs);
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
 const directory=path.resolve(__dirname,'../test-results/media-upload');await fs.mkdir(directory,{recursive:true});
 const result={passed:[],failures:[]},errors=[],unexpected=[];
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let page;
 try{
   page=await browser.newPage({viewport:{width:1440,height:900}});/* These checks control saving explicitly. */await page.addInitScript(()=>{try{localStorage.setItem('spacepick-autosave','off');}catch{}});
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin===new URL(base).origin){
       if(url.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic-public-key'}});
       return route.continue();
     }
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, PATCH, OPTIONS','access-control-allow-headers':'*'}});
     if(url.pathname==='/auth/v1/token')return route.fulfill({json:{access_token:'synthetic-user',refresh_token:'synthetic-refresh',expires_in:3600}});
     if(url.pathname==='/functions/v1/showroom-assets'){
       if(url.searchParams.get('action')==='upload'){
         const body=request.postDataBuffer(),boundary=/boundary=(.+)$/.exec(request.headers()['content-type'])[1],parts=body.toString('latin1').split('--'+boundary);
         const field=n=>{const p=parts.find(x=>x.includes(`name="${n}"`)&&!x.includes('filename='));return p?Buffer.from(p.split('\r\n\r\n')[1].replace(/\r\n$/,''),'latin1').toString('utf8'):'';};
         const filePart=parts.find(x=>x.includes('filename='));const name=Buffer.from(/filename="([^"]*)"/.exec(filePart)[1],'latin1').toString('utf8');const type=/Content-Type: ([^\r]+)/.exec(filePart)[1];
         const data=Buffer.from(filePart.slice(filePart.indexOf('\r\n\r\n')+4,filePart.length-2),'latin1');let width=0,height=0;
         if(type==='image/png'){width=data.readUInt32BE(16);height=data.readUInt32BE(20);}
         if(type==='image/jpeg'){for(let i=2;i<data.length;){const m=data[i+1],len=data.readUInt16BE(i+2);if(m>=0xc0&&m<=0xc3){height=data.readUInt16BE(i+5);width=data.readUInt16BE(i+7);break;}i+=2+len;}}
         uploads.push({name,type,width,height,kind:field('kind')});
         return route.fulfill({json:{id:crypto.randomUUID(),status:'private_review_pending',analysis:'skipped'},headers:{'access-control-allow-origin':'*'}});
       }
       return route.fulfill({json:{assets:[]},headers:{'access-control-allow-origin':'*'}});
     }
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
   await page.getByRole('navigation',{name:'작업 단계',exact:true}).getByRole('button',{name:'① 입력·자료',exact:true}).click();
   const media=page.locator('#property-media');
   await media.waitFor();
   // Drop three files at once: a large phone photo, a small PNG plan and a PDF.
   await media.locator('.media-drop').evaluate(async zone=>{
     const make=(w,h,type)=>new Promise(resolve=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,'#3a7');g.addColorStop(1,'#d83');x.fillStyle=g;x.fillRect(0,0,w,h);c.toBlob(resolve,type,0.95);});
     const big=new File([await make(4032,3024,'image/jpeg')],'IMG_4032.jpg',{type:'image/jpeg'});
     const plan=new File([await make(800,600,'image/png')],'plan.png',{type:'image/png'});
     const pdf=new File(['%PDF-1.4 synthetic'],'proposal.pdf',{type:'application/pdf'});
     const dt=new DataTransfer();[big,plan,pdf].forEach(f=>dt.items.add(f));
     zone.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
   });
   assert.equal(await media.locator('.media-queue li').count(),3);
   await media.getByLabel('IMG_4032.jpg 유형',{exact:true}).selectOption('photo');
   assert.equal(await media.getByLabel('plan.png 유형',{exact:true}).inputValue(),'provided_plan');
   await media.getByLabel('자료를 등록할 권한이 있습니다. 고객 공개는 쇼룸 승인 시 별도로 확인합니다.').check();
   await media.getByRole('button',{name:'3개 자료 비공개 보관',exact:true}).click();
   await media.getByText('3개를 비공개로 저장했습니다.',{exact:false}).waitFor();
   assert.equal(await media.locator('.media-queue li.media-done').count(),3);
   const byName=Object.fromEntries(uploads.map(u=>[u.name,u]));
   assert.deepEqual(Object.keys(byName).sort(),['IMG_4032.jpg','plan.png','proposal.pdf']);
   assert.equal(byName['IMG_4032.jpg'].type,'image/jpeg');assert.equal(Math.max(byName['IMG_4032.jpg'].width,byName['IMG_4032.jpg'].height),2560);
   assert.equal(byName['plan.png'].type,'image/png');assert.deepEqual([byName['plan.png'].width,byName['plan.png'].height],[800,600]);assert.equal(byName['plan.png'].kind,'provided_plan');assert.equal(byName['IMG_4032.jpg'].kind,'photo');
   assert.equal(byName['proposal.pdf'].kind,'document');
   await media.screenshot({path:path.join(directory,'media-upload.png')});
   for(const width of [375,768]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`upload area overflows at ${width}`);}
   await page.setViewportSize({width:1440,height:900});
   result.passed.push('three dropped files upload in turn; the large photo is scaled to 2,560px, the small plan and PDF are sent unchanged; each image keeps the type chosen for it');

   if(errors.length)throw Error('Page errors: '+errors.join(' | '));
   if(unexpected.length)throw Error('Unexpected requests: '+unexpected.join(', '));
 }catch(error){result.failures.push(error instanceof Error?error.message:String(error));if(page)await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
