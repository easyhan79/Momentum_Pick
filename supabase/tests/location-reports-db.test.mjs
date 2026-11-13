// Stage 4: location reports follow the listing's current address and only the service role can use them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const dir=new URL('../migrations/',import.meta.url);

async function database(){
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
  for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,dir),'utf8'));
  return db;
}
const next=async db=>(await db.query(`SELECT public.location_report_next() j`)).rows[0].j;
const save=async(db,id,address,state,report={},error='')=>(await db.query(`SELECT public.location_report_save($1,$2,$3,$4,$5) ok`,[id,address,state,report,error])).rows[0].ok;
const row=async(db,id)=>(await db.query(`SELECT address,state,report,error_code,attempts FROM property_location_reports WHERE property_id=$1`,[id])).rows[0];

test('reports follow the current draft address and keep good data through a failed refresh',async()=>{
  const db=await database(),id=crypto.randomUUID(),blank=crypto.randomUUID();
  await db.query(`INSERT INTO properties(id,address) VALUES($1,'옛 주소'),($2,NULL)`,[id,blank]);
  await db.query(`INSERT INTO property_showrooms(property_id,slug,draft_content) VALUES($1,'loc-test',$2)`,[id,{address:'서울 강남구 테헤란로 152'}]);
  // The draft address wins over the property record; listings without an address are skipped.
  assert.deepEqual(await next(db),{property_id:id,address:'서울 강남구 테헤란로 152'});
  // A result for an address the listing no longer has is discarded.
  assert.equal(await save(db,id,'옛 주소','done',{nearby:[]}),false);
  assert.equal(await save(db,id,'서울 강남구 테헤란로 152','done',{version:1,nearby:[{label:'지하철역'}]}),true);
  assert.equal(await next(db),null,'an up-to-date report needs no work');
  // A failed refresh of the same address keeps the last good report and counts the attempt.
  assert.equal(await save(db,id,'서울 강남구 테헤란로 152','failed',{},'kakao_500'),true);
  let r=await row(db,id);
  assert.equal(r.state,'failed');assert.equal(r.attempts,1);assert.equal(r.error_code,'kakao_500');assert.equal(r.report.version,1);
  assert.equal(await next(db),null,'failed fetches wait an hour');
  await db.query(`UPDATE property_location_reports SET updated_at=now()-interval '2 hours'`);
  assert.equal((await next(db)).property_id,id);
  // Changing the address makes the report stale; a new failure starts the count again.
  await db.query(`UPDATE property_showrooms SET draft_content=$2 WHERE property_id=$1`,[id,{address:'경기 여주시 가남읍 1'}]);
  assert.deepEqual(await next(db),{property_id:id,address:'경기 여주시 가남읍 1'});
  await save(db,id,'경기 여주시 가남읍 1','failed',{},'kakao_429');
  r=await row(db,id);assert.equal(r.attempts,1);assert.deepEqual(r.report,{},'data for the old address is not kept');
  // Not found waits for an address change; good reports are refreshed after 90 days.
  await save(db,id,'경기 여주시 가남읍 1','not_found');
  await db.query(`UPDATE property_location_reports SET updated_at=now()-interval '2 days'`);
  assert.equal(await next(db),null);
  await save(db,id,'경기 여주시 가남읍 1','done',{version:1});
  await db.query(`UPDATE property_location_reports SET fetched_at=now()-interval '91 days'`);
  assert.equal((await next(db)).property_id,id);
  await assert.rejects(save(db,id,'경기 여주시 가남읍 1','unknown'),/location_report_invalid/);
});

test('browsers cannot read reports or call the functions',async()=>{
  const db=await database();
  for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query(`SELECT * FROM property_location_reports`),/permission denied/);
    await assert.rejects(db.query(`SELECT public.location_report_next()`),/permission denied/);
    await db.exec(`RESET ROLE`);
  }
});
