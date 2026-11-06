import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),property='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',request=crypto.randomUUID();
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${property}');CREATE TABLE properties(id uuid PRIMARY KEY);INSERT INTO properties VALUES('${property}'),('${other}');GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;GRANT SELECT ON properties TO service_role;`);
 for(const file of ['20261102115440_showroom_private_schema.sql','20261103081255_inquiry_crm.sql','20261104114801_spacepick_permanent_routes_v1.sql','20261107010000_customer_inquiry_context.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await db.query("INSERT INTO property_showrooms(property_id,slug,showroom_status,draft_content,published_content,published_revision,approved_by,approved_at,published_at) VALUES($1,'synthetic-factory','published','{}',$2::jsonb,1,$1,now(),now())",[property,JSON.stringify({schema_version:'1.0',title:'합성 승인본'})]);
 await db.exec('SET ROLE service_role');
 const data={name:'합성',phone:'01000000000',deal_type:'both',intended_use:'전력 확인',memo:'[고객 검토 문맥]\n제조 운영\n전력 용량 확인 요청 (need-power_capacity)',consent_version:'synthetic-policy',service_interest:'property',source_channel:'showroom'};
 const register=async(id=request,rev=1,pid=property,fingerprint='a'.repeat(64))=>(await db.query('SELECT crm_register_context_inquiry($1,$2,$3,$4,$5,$6,$7::jsonb) result',[id,fingerprint,'b'.repeat(64),'synthetic-factory',pid,rev,JSON.stringify(data)])).rows[0].result;
 const first=await register();assert.equal((await register()).id,first.id);assert.equal((await register()).existing,true);assert.equal((await db.query('SELECT count(*)::int n FROM property_inquiries')).rows[0].n,1);
 const saved=(await db.query('SELECT * FROM property_inquiries')).rows[0];assert.equal(saved.property_id,property);assert.equal(saved.memo,data.memo);
 await assert.rejects(register(request,1,property,'c'.repeat(64)),/request_conflict/);
 await assert.rejects(register(crypto.randomUUID(),1,other),/context_property_mismatch/);
 await db.query('UPDATE property_showrooms SET revision=2,published_revision=2 WHERE property_id=$1',[property]);
 await assert.rejects(register(crypto.randomUUID(),1),/context_revision_conflict/);assert.equal((await register()).id,first.id,'idempotent replay survives a later approval revision');
 await register(crypto.randomUUID(),2);
 for(let i=0;i<3;i++)await register(crypto.randomUUID(),2);
 await assert.rejects(register(crypto.randomUUID(),2),/rate_limited/);
 assert.equal((await db.query('SELECT count(*)::int n FROM property_inquiries')).rows[0].n,5);
 await db.query("UPDATE property_showrooms SET listing_state='closed' WHERE property_id=$1",[property]);await assert.rejects(register(crypto.randomUUID(),2),/showroom_unavailable/);
 await db.query("UPDATE property_inquiries SET lead_stage='lost',closed_at=now()-interval '91 days'");await db.query('SELECT crm_retention_cleanup()');assert.ok((await db.query('SELECT memo,redacted_at FROM property_inquiries')).rows.every(r=>r.memo===''&&r.redacted_at));
 await db.exec('RESET ROLE');
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(register(),e=>e.code==='42501');await db.exec('RESET ROLE');}
 const preflight=await db.exec(await readFile(new URL('../review/v21_preflight.sql',import.meta.url),'utf8'));
 assert.ok(preflight[0].rows[0].routes);assert.ok(preflight[2].rows[0].legacy_register);assert.ok(preflight[2].rows[0].contextual_register);assert.ok(preflight[2].rows[0].retention_cleanup);
 assert.deepEqual(preflight[3].rows[0],{anon_must_be_false:false,authenticated_must_be_false:false});
 console.log('PASS contextual inquiry SQL: correct CRM property/memo, duplicate/conflict, property/revision pin, closed listing, rate limit, retention, restricted roles and read-only deployment preflight');
}catch(error){console.error({name:error.name,message:error.message,code:error.code});process.exitCode=1;}finally{await db.close();}
