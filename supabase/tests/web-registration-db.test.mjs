// npm install --prefix /workspace/spacepick-test-tools @electric-sql/pglite@0.3.14
// PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/web-registration-db.test.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const actor='10000000-0000-4000-8000-000000000001',request='20000000-0000-4000-8000-000000000002';
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${actor}');
 CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 GRANT SELECT,INSERT,UPDATE ON properties TO service_role;GRANT SELECT ON auth.users TO service_role;`);
 for(const filename of ['20261102115440_showroom_private_schema.sql','20261103115337_analysis_recovery_queue.sql','20261105140000_web_property_registration.sql'])await db.exec(await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8'));
 await db.exec('SET ROLE service_role');
 const content={schema_version:'1.0',propertyProfile:{version:1},title:'합성 매물',address:'합성 소재지'};
 const create=async(payload=content)=>(await db.query('SELECT web_create_property($1,$2,$3::jsonb) result',[request,actor,JSON.stringify(payload)])).rows[0].result;
 const first=await create(),replay=await create();assert.equal(replay.property_id,first.property_id);assert.equal(replay.duplicate,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM properties')).rows[0].n,1);
 await assert.rejects(create({...content,title:'다른 내용'}),/registration_request_conflict/);
 assert.equal((await db.query('SELECT analysis_claim() result')).rows[0].result,null,'unfinished manual draft must not be claimed');
 await assert.rejects(db.query('SELECT web_queue_analysis($1,2,$2)',[first.property_id,'입력자료']),/revision_conflict/);
 const queue=async()=>(await db.query('SELECT web_queue_analysis($1,1,$2) result',[first.property_id,'웹 등록 합성 입력자료'])).rows[0].result;
 assert.equal((await queue()).queued,true);assert.equal((await queue()).queued,false);
 const job=(await db.query('SELECT analysis_claim() result')).rows[0].result;assert.equal(job.id,first.property_id);assert.match(job.raw_input,/웹 등록/);
 assert.equal((await queue()).queued,false,'a running job must not be restarted');
 const generated={usp_summary:'합성 분석',landing_copy:'합성 제목',showroom_concepts:[]};
 assert.equal((await db.query('SELECT analysis_complete($1,$2,$3::jsonb) result',[job.id,job.token,JSON.stringify(generated)])).rows[0].result,true);
 assert.equal((await queue()).queued,false,'completed job is not implicitly reanalyzed');
 const room=(await db.query('SELECT * FROM property_showrooms WHERE property_id=$1',[first.property_id])).rows[0];
 assert.equal(room.draft_content.title,'합성 매물');assert.equal(room.published_content,null);assert.equal(room.showroom_status,'draft');
 // A failed transaction must not leave a partial property or queue entry.
 await assert.rejects(db.query('SELECT web_create_property($1,$2,$3::jsonb)',[crypto.randomUUID(),actor,JSON.stringify({...content,id:'bad',propertyProfile:null})]),/invalid_registration/);
 await assert.rejects(db.query('SELECT web_create_property($1,$2,$3::jsonb)',[crypto.randomUUID(),crypto.randomUUID(),JSON.stringify(content)]),error=>error.code==='23503');
 assert.equal((await db.query('SELECT count(*)::int n FROM properties')).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM property_analysis_jobs')).rows[0].n,1);
 await db.exec('RESET ROLE');
 for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   for(const sql of ['SELECT * FROM property_web_intakes',`SELECT web_create_property('${request}','${actor}','{}')`,`SELECT web_queue_analysis('${first.property_id}',1,'test')`])await assert.rejects(db.query(sql),error=>error.code==='42501');
   await db.exec('RESET ROLE');
 }
 console.log('PASS web registration: atomic creation, request replay/conflict, held draft queue, revision, explicit queue, analysis completion, private draft preservation, role permissions');
}finally{await db.close();}
