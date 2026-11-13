// 250 KRW is reserved per image request, so the 2,500 KRW per-listing limit allows 10 requests.
// Listings that already used requests at the old 500 KRW rate are recounted at the new rate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const dir=new URL('../migrations/',import.meta.url);
const NEW='20261113010000_image_reservation_250.sql';

test('ten 250 KRW requests fit per listing and earlier 500 KRW reservations are recounted',async()=>{
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
  const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(files.includes(NEW));
  for(const f of files.filter(f=>f<NEW))await db.exec(await readFile(new URL(f,dir),'utf8'));
  const legacy=crypto.randomUUID(),fresh=crypto.randomUUID(),slots=['hero','concept-1','concept-2','concept-3'];
  await db.query(`INSERT INTO properties(id) VALUES($1),($2)`,[legacy,fresh]);
  // A listing prepared under the old rate: four images, one attempt each, 4 x 500 KRW reserved.
  await db.query(`INSERT INTO property_image_budgets(property_id,reserved_krw) VALUES($1,2000)`,[legacy]);
  for(const slot of slots)await db.query(`INSERT INTO property_image_jobs(property_id,slot,state,attempts) VALUES($1,$2,'done',1)`,[legacy,slot]);
  await db.exec(await readFile(new URL(NEW,dir),'utf8'));
  assert.equal((await db.query(`SELECT reserved_krw FROM property_image_budgets WHERE property_id=$1`,[legacy])).rows[0].reserved_krw,1000);

  await db.query(`INSERT INTO property_image_budgets(property_id) VALUES($1)`,[fresh]);
  const jobs=[];
  for(const slot of slots)jobs.push((await db.query(`INSERT INTO property_image_jobs(property_id,slot) VALUES($1,$2) RETURNING id`,[fresh,slot])).rows[0].id);
  const claim=async id=>{await db.query(`UPDATE property_image_jobs SET state='queued' WHERE id=$1`,[id]);return (await db.query(`SELECT public.image_claim_before_web($1) j`,[id])).rows[0].j;};
  for(let n=1;n<=10;n++){
    assert.ok(await claim(jobs[(n-1)%4]),`request ${n} should be allowed`);
    assert.equal((await db.query(`SELECT reserved_krw FROM property_image_budgets WHERE property_id=$1`,[fresh])).rows[0].reserved_krw,n*250);
  }
  assert.equal(await claim(jobs[2]),null,'the 11th request is blocked');
  assert.equal((await db.query(`SELECT state,last_error_code FROM property_image_jobs WHERE id=$1`,[jobs[2]])).rows[0].last_error_code,'budget_limit');
  // The automatic preparation path uses the same rate.
  for(const name of ['image_enqueue_before_manual','web_automatic_apply','web_automatic_image_enqueue','web_retry_automatic_cover']){
    const d=(await db.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,[name])).rows[0].d;
    assert.match(d,/250/,name);assert.doesNotMatch(d,/\b500\b/,name);
  }
  await db.close();
});
