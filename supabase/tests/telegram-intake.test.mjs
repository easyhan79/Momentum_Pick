import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());GRANT SELECT,INSERT,UPDATE ON properties TO service_role;`);
for(const file of ['migrations/20261103115337_analysis_recovery_queue.sql','review/telegram_intake_reliability.sql'])await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
await db.exec('SET ROLE service_role');
const ingest=async(update,message,album='',text='sample',file='')=>(await db.query('SELECT telegram_ingest($1,$2,$3,$4,$5,$6) r',[update,'123',message,album,text,file])).rows[0].r;
const first=await ingest(1,10,'album-1','caption','file-1');for(let i=2;i<=6;i++)assert.equal((await ingest(i,9+i,'album-1','',`file-${i}`)).property_id,first.property_id);
assert.equal((await db.query('SELECT count(*)::int n FROM properties')).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int n FROM property_analysis_jobs')).rows[0].n,1);
assert.equal((await ingest(1,10,'album-1','caption','file-1')).duplicate,true);assert.equal((await db.query('SELECT count(*)::int n FROM telegram_intake_updates')).rows[0].n,6);
assert.equal((await db.query('SELECT analysis_claim() r')).rows[0].r,null);await db.query("UPDATE property_analysis_jobs SET next_attempt_at=now() WHERE property_id=$1",[first.property_id]);
const job=(await db.query('SELECT analysis_claim() r')).rows[0].r;assert.equal(job.raw_input.match(/FILE_ID:/g).length,6);await assert.rejects(ingest(7,16,'album-1','late'),/intake_already_processing/);
const claim=async()=>(await db.query('SELECT telegram_receipt_claim(NULL) r')).rows[0].r;let receipt=await claim();assert.equal(receipt.property_id,first.property_id);assert.equal(await claim(),null);
assert.equal((await db.query("SELECT telegram_receipt_complete($1,$2,true,'') r",[receipt.property_id,crypto.randomUUID()])).rows[0].r,false);
await db.query("SELECT telegram_receipt_complete($1,$2,false,'telegram_401')",[receipt.property_id,receipt.token]);assert.equal(await claim(),null);await db.exec("UPDATE telegram_intake_batches SET receipt_due=now()");receipt=await claim();await db.query("SELECT telegram_receipt_complete($1,$2,true,'')",[receipt.property_id,receipt.token]);assert.equal(await claim(),null);
assert.notEqual((await ingest(8,20,'','other property')).property_id,first.property_id);
await db.exec('RESET ROLE');for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);for(const sql of ['SELECT * FROM telegram_intake_batches','SELECT * FROM telegram_intake_updates','SELECT * FROM telegram_merged_sources','SELECT telegram_receipt_claim(NULL)'])await assert.rejects(db.query(sql),e=>e.code==='42501');await db.exec('RESET ROLE');}
await db.close();console.log('PASS album grouping, queue debounce, webhook replay, lease/retry, separate messages and private permissions');
