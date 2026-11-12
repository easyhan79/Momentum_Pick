/* Browser check for the marketing export: Naver blog copy, blog photo ZIP and
 * card news ZIP. Uses the real admin handler with in-memory data; all nonlocal
 * traffic is intercepted and no AI provider is called. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001',PNG='iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAGklEQVR4nGP8z4AHMDEwMIxqGNUwqmEAaQYAOlUCEX6uZ0IAAAAASUVORK5CYII=';
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
   if(pathname.includes('/properties?'))return Response.json([{id:property,address:'합성 소재지',status:'analyzed',created_at:'2026-11-12T01:00:00Z',ai_contents:{target_1_blog:'제목: 테라스 상가 소개\n■ 위치\n역에서 가깝습니다.\n■ 공간\n**넓은** 테라스가 있습니다.\n마무리 문단입니다.',target_2_blog:'제목: 두 번째 글\n본문',insta_caption:[1,2,3,4,5].map(n=>`[카드 ${n}]\n카드 ${n} 제목\n카드 ${n} 설명`).join('\n')}}]);
   if(['/property_web_intakes?','/property_assets?','/property_image_jobs?','/property_image_budgets?','/property_showroom_routes?','/property_analysis_jobs?','/property_inquiries?','/inquiry_activity?'].some(p=>pathname.includes(p)))return Response.json([]);
   throw Error('Unexpected mock database request: '+pathname);
 };
 const admin=createHandler({url:'https://mock-db',key:'synthetic-server-key',fetcher:mockFetch});
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const directory=path.resolve(__dirname,'../test-results/marketing-export');await fs.mkdir(directory,{recursive:true});
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
     if(url.pathname==='/functions/v1/showroom-assets'){if(url.searchParams.get('action')==='image')return route.fulfill({contentType:'image/png',body:Buffer.from(PNG,'base64'),headers:{'access-control-allow-origin':'*'}});return route.fulfill({json:{assets:[{id:'30000000-0000-4000-8000-000000000001',kind:'concept',source_type:'ai_generated',caption:'대표 이미지'},{id:'30000000-0000-4000-8000-000000000002',kind:'concept',source_type:'ai_generated',caption:'콘셉트 1'}]},headers:{'access-control-allow-origin':'*'}});}
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

   // Marketing package: Naver blog copy and ZIP downloads.
   const marketing=page.locator('.naver-export');
   await marketing.scrollIntoViewIfNeeded();
   await marketing.getByRole('button',{name:'사진 ZIP 내려받기 (2장)',exact:true}).waitFor();
   await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(base).origin});
   await marketing.getByRole('button',{name:'제목 복사',exact:true}).click();
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'테라스 상가 소개');
   await marketing.getByRole('button',{name:'본문 복사 (네이버용)',exact:true}).click();
   await marketing.getByText('본문을 복사했습니다.',{exact:false}).waitFor();
   const copied=await page.evaluate(async()=>{const [item]=await navigator.clipboard.read();return {html:await (await item.getType('text/html')).text(),plain:await (await item.getType('text/plain')).text()};});
   assert.match(copied.html,/<strong style="font-size:19px">위치<\/strong>/);
   assert.match(copied.plain,/\[사진 1 넣기 · AI 활용 예시 · 실제 사진 아님 · 대표 이미지\]/);
   assert.match(copied.plain,/\[사진 2 넣기/);
   assert.match(copied.plain,/매물 자세히 보기·문의: http:\/\/127\.0\.0\.1:\d+\/conflict-qa/);
   await marketing.screenshot({path:path.join(directory,'naver-export.png')});
   result.passed.push('Naver title and formatted body are copied with numbered photo slots and the showroom link');
   const photoDownload=page.waitForEvent('download',{timeout:15000});photoDownload.catch(()=>{});
   await marketing.getByRole('button',{name:'사진 ZIP 내려받기 (2장)',exact:true}).click();
   const photoZip=path.join(directory,'blog-photos.zip');await (await photoDownload).saveAs(photoZip);
   await page.getByRole('button',{name:'인스타그램 · 카드뉴스 구성안',exact:true}).click();
   await page.locator('canvas[data-card="5"][data-ready="true"]').waitFor();
   const cardDownload=page.waitForEvent('download',{timeout:15000});cardDownload.catch(()=>{});
   await page.getByRole('button',{name:'카드 5장 ZIP 내려받기 (1080×1350)',exact:true}).click();
   const cardZip=path.join(directory,'card-news.zip');await (await cardDownload).saveAs(cardZip);
   const inspected=JSON.parse(require('node:child_process').execFileSync('python3',['-I','-c',`import sys,zipfile,json,struct
out={}
for f in sys.argv[1:]:
  z=zipfile.ZipFile(f);assert z.testzip() is None
  out[f]=[[i.filename]+list(struct.unpack('>II',z.read(i)[16:24])) for i in z.infolist()]
print(json.dumps(out))`,photoZip,cardZip]).toString());
   assert.deepEqual(inspected[photoZip].map(r=>r[0]),['사진01.png','사진02.png']);
   assert.deepEqual(inspected[cardZip].map(r=>r[0]),['카드01.png','카드02.png','카드03.png','카드04.png','카드05.png']);
   assert.ok(inspected[cardZip].every(r=>r[1]===1080&&r[2]===1350));
   await page.locator('[aria-label="카드뉴스 이미지 작업실"]').screenshot({path:path.join(directory,'card-news.png')});
   result.passed.push('blog photos and five 1080x1350 card news images download as valid ZIP files');

   if(errors.length)throw Error('Page errors: '+errors.join(' | '));
   if(unexpected.length)throw Error('Unexpected requests: '+unexpected.join(', '));
 }catch(error){result.failures.push(error instanceof Error?error.message:String(error));if(page)await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false}).catch(()=>{});}
 finally{await browser.close();await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;}
})();
