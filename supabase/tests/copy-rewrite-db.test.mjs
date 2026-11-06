import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const actor='10000000-0000-4000-8000-000000000001',property='20000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${actor}');CREATE TABLE properties(id uuid PRIMARY KEY,ai_contents jsonb,status text);INSERT INTO properties VALUES('${property}','{"target_1_blog":"original AI"}','analyzed'),('${other}','{}','analyzed');GRANT USAGE ON SCHEMA public,auth TO service_role,anon,authenticated;GRANT SELECT,INSERT,UPDATE ON properties TO service_role;GRANT SELECT ON auth.users TO service_role;`);
 for(const f of ['20261102115440_showroom_private_schema.sql','20261107020000_copy_rewrites.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const content={schema_version:'1.0',summary:'old summary',subtitle:'old title',marketing:{target_1_blog:'old blog',target_2_blog:'keep second',insta_caption:'keep cards'},propertyProfile:{version:1,kind:'factory',fields:[{id:'power',value:0}]},concepts:[{id:'concept-1'}],assets:[{id:'synthetic-image'}]};
 await db.query("INSERT INTO property_showrooms(property_id,slug,showroom_status,draft_content,published_content,published_revision,approved_by,approved_at,published_at) VALUES($1,'synthetic','published',$2::jsonb,$2::jsonb,1,$3,now(),now())",[property,JSON.stringify(content),actor]);
 await db.query("INSERT INTO property_showrooms(property_id,slug,draft_content) VALUES($1,'other','{}')",[other]);
 await db.exec('SET ROLE service_role');
 const queue=async(id,revision=1,fields=['summary','target_1_blog'],instruction='간결하게')=>(await db.query('SELECT copy_rewrite_queue($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) v',[id,property,actor,revision,fields,instruction,JSON.stringify({provided:{value:0}}),JSON.stringify(Object.fromEntries(fields.map(f=>[f,f==='summary'?content.summary:content.marketing[f]||'old'])))])).rows[0].v;
 const claim=async()=>(await db.query('SELECT copy_rewrite_claim() v')).rows[0].v;
 const complete=async(job,result,error='',retry=false)=>(await db.query('SELECT copy_rewrite_complete($1,$2,$3::jsonb,NULL,$4,$5) v',[job.id,job.token,result===null?null:JSON.stringify(result),error,retry])).rows[0].v;
 const decide=async(id,revision=1,apply=true,pid=property)=>(await db.query('SELECT copy_rewrite_decide($1,$2,$3,$4) v',[id,pid,revision,apply])).rows[0].v;
 const first=crypto.randomUUID();assert.equal((await queue(first)).queued,true);assert.equal((await queue(first)).queued,false);
 await assert.rejects(queue(first,1,['summary','target_1_blog'],'different'),/rewrite_request_conflict/);
 await assert.rejects(queue(crypto.randomUUID()),/rewrite_busy/);
 const job=await claim();assert.equal(job.id,first);assert.equal(job.attempt,1);assert.equal((await claim()),null);
 assert.equal(await complete({...job,token:crypto.randomUUID()},{summary:'bad',target_1_blog:'bad'}),false);
 await assert.rejects(complete(job,{summary:'missing blog'}),/rewrite_invalid/);await assert.rejects(complete(job,{summary:'ok',target_1_blog:'ok',image:'extra'}),/rewrite_invalid/);
 assert.equal(await complete(job,{summary:'new summary',target_1_blog:'new blog'}),true);
 const untouched=(await db.query('SELECT * FROM property_showrooms WHERE property_id=$1',[property])).rows[0];assert.equal(untouched.revision,1);assert.deepEqual(untouched.draft_content,content);assert.deepEqual(untouched.published_content,content);
 await assert.rejects(decide(first,1,true,other),/rewrite_missing/);
 const applied=await decide(first);assert.equal(applied.revision,2);assert.equal(applied.draft_content.summary,'new summary');assert.equal(applied.draft_content.marketing.target_1_blog,'new blog');assert.equal(applied.draft_content.marketing.target_2_blog,'keep second');
 for(const key of ['concepts','assets','propertyProfile'])assert.deepEqual(applied.draft_content[key],content[key]);assert.deepEqual(applied.published_content,content);assert.equal((await decide(first)).revision,2,'network replay applies once');
 assert.equal((await db.query('SELECT ai_contents FROM properties WHERE id=$1',[property])).rows[0].ai_contents.target_1_blog,'original AI');
 const second=crypto.randomUUID();await queue(second,2);const stale=await claim();await complete(stale,{summary:'stale',target_1_blog:'stale'});await db.query('UPDATE property_showrooms SET revision=3 WHERE property_id=$1',[property]);await assert.rejects(decide(second,3),/rewrite_stale/);await decide(second,0,false);
 const third=crypto.randomUUID();await queue(third,3);let retried=await claim();assert.equal(await complete(retried,null,'provider_transport',true),true);assert.equal(await claim(),null,'retry backoff');
 await db.query("UPDATE property_copy_rewrites SET next_attempt_at=now()-interval '1 minute' WHERE id=$1",[third]);retried=await claim();assert.equal(retried.attempt,2);
 await db.query("UPDATE property_copy_rewrites SET lease_until=now()-interval '1 minute' WHERE id=$1",[third]);assert.equal(await complete(retried,{summary:'expired',target_1_blog:'expired'}),false);retried=await claim();assert.equal(retried.attempt,3);
 await complete(retried,null,'provider_transport',true);assert.equal((await db.query('SELECT state,source FROM property_copy_rewrites WHERE id=$1',[third])).rows[0].state,'failed');
 await assert.rejects(queue(crypto.randomUUID(),3),/rewrite_rate_limited/);
 await db.query("UPDATE property_copy_rewrites SET created_at=now()-interval '2 hours' WHERE property_id=$1",[property]);const cancelled=crypto.randomUUID();await queue(cancelled,3);const running=await claim();await decide(cancelled,0,false);assert.equal(await complete(running,{summary:'late',target_1_blog:'late'}),false);
 await db.exec('RESET ROLE');
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM property_copy_rewrites'),e=>e.code==='42501');for(const sql of ['SELECT copy_rewrite_claim()',`SELECT copy_rewrite_decide('${first}','${property}',1,true)`,`SELECT copy_rewrite_complete('${first}','${actor}','{}')`,`SELECT copy_rewrite_queue('${first}','${property}','${actor}',1,ARRAY['summary'],'','{}','{}')`])await assert.rejects(db.query(sql),e=>e.code==='42501');await db.exec('RESET ROLE');}
 console.log('PASS copy rewrites SQL: private roles, idempotency, one pending, exact fields, leases/backoff/max attempts, cancel/lost claim, stale revision, hourly rate, selected draft apply and snapshot/image/property preservation');
}catch(error){console.error({name:error.name,message:error.message,code:error.code,position:error.position,internalPosition:error.internalPosition,where:error.where});process.exitCode=1;}finally{await db.close();}
