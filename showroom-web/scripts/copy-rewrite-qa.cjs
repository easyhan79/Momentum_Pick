// Synthetic browser -> real admin handler -> isolated PostgreSQL RPCs. No live AI.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
 const {createHandler}=await import('../../supabase/functions/showroom-admin/index.ts');
 const property='10000000-0000-4000-8000-000000000001';
 const original={schema_version:'1.0',id:property,title:'합성 등록 매물',subtitle:'기존 제목',summary:'기존 요약 · 전력 0 kW는 확인 필요',category:'industrial',address:'합성 소재지',facts:[],concepts:[{id:'concept-1',conceptName:'기존 콘셉트',headline:'조건 확인',rationale:'제공자료 검토',feasibility:'not_checked',zones:[]}],assets:[],unknowns:[],marketing:{target_1_blog:'# 기존 블로그\n\n기존 문안',target_2_blog:'# 기존 두 번째 글',insta_caption:'기존 카드 문구'}};
 const results={passed:[],failures:[]},errors=[],unexpected=[];
 const base=process.env.SHOWROOM_QA_URL||'http://127.0.0.1:5173';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const dir=path.resolve(__dirname,'../test-results/'+(process.env.SHOWROOM_QA_URL?'copy-rewrite-built':'copy-rewrite'));await fs.mkdir(dir,{recursive:true});
 let browser,page;
 try{
  await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${property}');CREATE TABLE properties(id uuid PRIMARY KEY,address text,status text,created_at timestamptz DEFAULT now(),ai_contents jsonb,raw_input text);INSERT INTO properties VALUES('${property}','합성 소재지','analyzed',now(),'{"target_1_blog":"AI original","document_facts":[]}','제공 전력 0 kW. 단위와 조건 확인 필요');GRANT USAGE ON SCHEMA public,auth TO service_role;GRANT SELECT,INSERT,UPDATE ON properties TO service_role;GRANT SELECT ON auth.users TO service_role;`);
  for(const file of ['20261102115440_showroom_private_schema.sql','20261107020000_copy_rewrites.sql'])await db.exec(await fs.readFile(path.resolve(__dirname,'../../supabase/migrations/'+file),'utf8'));
  await db.query("INSERT INTO property_showrooms(property_id,slug,showroom_status,draft_content,published_content,published_revision,approved_by,approved_at,published_at) VALUES($1,'synthetic-rewrite','published',$2::jsonb,$2::jsonb,1,$1,now(),now())",[property,JSON.stringify(original)]);await db.exec('SET ROLE service_role');
  const room=async()=>(await db.query('SELECT * FROM property_showrooms WHERE property_id=$1',[property])).rows[0];
  const mockFetch=async(input,init={})=>{const url=new URL(String(input)),table=url.pathname.split('/').pop(),b=init.body?JSON.parse(init.body):null;
   if(url.pathname.endsWith('/auth/v1/user'))return Response.json({id:property,app_metadata:{showroom_admin:true}});
   try{
    if(url.pathname.includes('/rpc/')){
     const argumentsByName={copy_rewrite_queue:['p_id','p_property','p_actor','p_revision','p_fields','p_instruction','p_source','p_original'],copy_rewrite_decide:['p_id','p_property','p_revision','p_apply']};
     const keys=argumentsByName[table];if(!keys)throw Error('unexpected RPC');const parameters=keys.map(k=>['p_source','p_original'].includes(k)?JSON.stringify(b[k]):b[k]);
     return Response.json((await db.query(`SELECT ${table}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) v`,parameters)).rows[0].v);
    }
    if(table==='properties')return Response.json((await db.query('SELECT * FROM properties')).rows);
    if(table==='property_copy_rewrites')return Response.json((await db.query('SELECT * FROM property_copy_rewrites ORDER BY created_at DESC')).rows);
    if(table==='property_showrooms'){
     if(init.method==='POST')return new Response(null,{status:204});
     if(init.method==='PATCH'){const expected=Number((url.searchParams.get('revision')||'eq.0').slice(3));const current=await room();if(current.revision!==expected)return Response.json([]);await db.query('UPDATE property_showrooms SET draft_content=$1::jsonb,revision=$2 WHERE property_id=$3',[JSON.stringify(b.draft_content),b.revision,property]);}
     return Response.json([await room()]);
    }
    if(['property_web_intakes','property_assets','property_analysis_jobs','property_image_jobs','property_image_budgets','property_showroom_routes'].includes(table))return Response.json([]);
    throw Error('unexpected mock path');
   }catch(e){return Response.json({message:e.message,code:e.code},{status:400});}
  };
  const handler=createHandler({url:'https://mock-db',key:'synthetic',fetcher:mockFetch,copyRewriteEnabled:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul'});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('same key'))errors.push(m.text());});
  await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());
   if(url.origin===new URL(base).origin){if(url.pathname==='/supabase-public.json')return route.fulfill({json:{publishableKey:'synthetic'}});return route.continue();}
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'*'}});
   if(url.pathname==='/auth/v1/token')return route.fulfill({json:{access_token:'synthetic',refresh_token:'synthetic',expires_in:3600}});
   if(url.pathname==='/functions/v1/showroom-assets')return route.fulfill({json:{assets:[]}});
   if(url.pathname==='/functions/v1/showroom-crm')return route.fulfill({json:{inquiries:[],activities:[],summary:{}}});
   if(url.pathname==='/functions/v1/showroom-admin'){const response=await handler(new Request(request.url(),{method:request.method(),headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},...(request.postData()?{body:request.postData()}:{})}));return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json','access-control-allow-origin':'*'}});}
   unexpected.push(url.pathname);return route.abort();
  });
  const login=async()=>{await page.goto(base+'/admin');await page.getByLabel('이메일',{exact:true}).fill('qa@example.invalid');await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('button',{name:'초안 열기',exact:true}).click();await page.getByRole('button',{name:'고급 편집 · 전체 패널',exact:true}).click();/* these checks cover every panel */await page.locator('#copy-rewrite').waitFor();};
  await login();let panel=page.locator('#copy-rewrite');const start=()=>panel.getByRole('button',{name:'선택한 항목 다시 글작성',exact:true});
  await page.getByLabel('요약 · AI 문구 검토 필요',{exact:true}).fill('미저장 편집');assert.equal(await start().isDisabled(),true);
  await page.getByLabel('요약 · AI 문구 검토 필요',{exact:true}).fill(original.summary);await page.locator('#showroom-draft').getByRole('button',{name:'초안 저장',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.admin-message')?.textContent.includes('저장했습니다'));
  results.passed.push('registered property opens rewrite panel; unsaved showroom edits block generation');
  for(const label of ['쇼룸 제목','블로그 · 타깃 2','카드뉴스 문구'])await panel.getByLabel(label,{exact:true}).uncheck();
  await panel.getByLabel('작성 방향 · 선택',{exact:true}).fill('실사용자 중심으로 짧게');await start().click();await panel.locator('p[role="status"]').filter({hasText:'작성 대기'}).waitFor();assert.equal((await room()).draft_content.summary,original.summary);
  await login();panel=page.locator('#copy-rewrite');await panel.locator('p[role="status"]').filter({hasText:'작성 대기'}).waitFor();assert.equal(await start().isDisabled(),true);
  const claim=async()=>(await db.query('SELECT copy_rewrite_claim() v')).rows[0].v;
  const complete=async(job,result,error='',retry=false)=>(await db.query('SELECT copy_rewrite_complete($1,$2,$3::jsonb,NULL,$4,$5) v',[job.id,job.token,result===null?null:JSON.stringify(result),error,retry])).rows[0].v;
  const refresh=async()=>{await panel.getByRole('button',{name:'작성 상태 새로고침',exact:true}).click();await page.waitForTimeout(150);};
  let job=await claim();assert.deepEqual(job.fields,['summary','target_1_blog']);assert.equal(job.instruction,'실사용자 중심으로 짧게');await complete(job,{summary:'새 요약 · 제공 전력 0 kW는 조건 확인 필요',target_1_blog:'# 새 블로그\n\n제공 조건을 확인하세요.'});await refresh();await panel.getByText('새 요약 · 제공 전력 0 kW는 조건 확인 필요',{exact:true}).waitFor();
  for(const width of [1440,768,375]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await panel.screenshot({path:path.join(dir,`compare-${width}.png`)});}
  results.passed.push('queue survives reload; real SQL claim/complete yields side-by-side selected text at 1440/768/375 without changing originals');
  await panel.getByRole('button',{name:'새 글을 비공개 초안에 적용',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#draft-summary')?.value.startsWith('새 요약'));
  const applied=await room();assert.equal(applied.revision,3);assert.equal(applied.draft_content.marketing.target_1_blog,'# 새 블로그\n\n제공 조건을 확인하세요.');assert.deepEqual(applied.published_content,original);assert.deepEqual(applied.draft_content.concepts,original.concepts);assert.equal(applied.draft_content.marketing.target_2_blog,original.marketing.target_2_blog);
  await page.locator('.marketing-package').getByRole('button',{name:'글 편집',exact:true}).click();await page.locator('.marketing-package textarea').fill('광고 미저장 수정');assert.equal(await start().isDisabled(),true);await page.getByRole('button',{name:'광고 초안 저장',exact:true}).click();await page.locator('.marketing-package').getByText('광고 초안을 비공개로 저장했습니다.',{exact:true}).waitFor();
  results.passed.push('explicit apply updates selected draft fields and reloads marketing; published snapshot/concepts/AI originals preserved; unsaved marketing blocks regeneration');
  await start().click();job=await claim();await complete(job,null,'provider_auth',false);await refresh();await panel.getByText('새 문안을 만들지 못했습니다.',{exact:false}).waitFor();assert.equal((await room()).draft_content.summary,applied.draft_content.summary);
  await start().click();job=await claim();await refresh();await panel.getByRole('button',{name:'요청 취소 · 기존 글 유지',exact:true}).click();assert.equal(await complete(job,{summary:'late',target_1_blog:'late'}),false);
  results.passed.push('failed generation leaves current copy unchanged; retry creates new request; cancelling a running request rejects late completion');
  await db.query("UPDATE property_copy_rewrites SET created_at=now()-interval '2 hours'");await start().click();job=await claim();await complete(job,{summary:'stale summary',target_1_blog:'stale blog'});await refresh();
  await db.query("UPDATE property_showrooms SET revision=revision+1,draft_content=jsonb_set(draft_content,'{summary}','\"other editor change\"') WHERE property_id=$1",[property]);
  await page.getByRole('button',{name:'저장본 다시 불러오기',exact:true}).click();await panel.getByText('작성 요청 후 초안이 바뀌었습니다.',{exact:false}).waitFor();assert.equal(await panel.getByRole('button',{name:'새 글을 비공개 초안에 적용',exact:true}).isDisabled(),true);await panel.getByRole('button',{name:'새 글 사용 안 함 · 기존 글 유지',exact:true}).click();assert.equal((await room()).draft_content.summary,'other editor change');
  assert.equal((await db.query('SELECT ai_contents FROM properties')).rows[0].ai_contents.target_1_blog,'AI original');assert.deepEqual((await room()).published_content,original);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  results.passed.push('newer saved revision blocks stale apply; discarding preserves latest edits and original approval; no page errors or external requests');
 }catch(e){results.failures.push({message:e.message,stack:e.stack});if(page)await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
 finally{if(browser)await browser.close();await db.close();await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
