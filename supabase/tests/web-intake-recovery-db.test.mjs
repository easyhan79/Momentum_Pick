import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const actor='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',request=crypto.randomUUID();
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${actor}'),('${other}');CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;GRANT SELECT,INSERT,UPDATE ON properties TO service_role;GRANT SELECT ON auth.users TO service_role;`);
 for(const f of ['20261102115440_showroom_private_schema.sql','20261103115337_analysis_recovery_queue.sql','20261105140000_web_property_registration.sql','20261107040000_web_intake_recovery.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 await db.exec('SET ROLE service_role');
 const content={schema_version:'1.0',title:'매물 초안',summary:'AI copy is not original',propertyProfile:{version:1,fields:[]},registration:{channel:'web'},imagePolicy:{version:1,mode:'manual_web'}};
 const original={version:1,mode:'simple',providedText:'원본 텍스트 0 kW [FILE_ID:not-a-download]'},revised={...original,providedText:'수정 원문'};
 const create=async(source=original)=>(await db.query('SELECT web_create_intake($1,$2,$3::jsonb,$4::jsonb) v',[request,actor,JSON.stringify(content),JSON.stringify(source)])).rows[0].v;
 const first=await create(),property=first.receipt.propertyId;assert.equal((await create()).receipt.propertyId,property);assert.equal((await create()).duplicate,true);assert.equal(first.receipt.formClosed,false);assert.equal(first.receipt.providedText,original.providedText);
 assert.equal((await db.query('SELECT count(*)::int n FROM properties')).rows[0].n,1);assert.equal((await db.query('SELECT analysis_claim() v')).rows[0].v,null);
 assert.equal((await db.query('SELECT web_intake_receipt($1,$2,NULL) v',[other,request])).rows[0].v,null);
 await assert.rejects(create(revised),/registration_request_conflict/);
 const write=crypto.randomUUID(),form={...content,title:'새 제목'};
 const save=async(revision=1,source=revised,payload=form,finish=false)=>(await db.query('SELECT web_save_intake($1,$2,$3,$4,$5::jsonb,$6::jsonb,$6::jsonb,$7) v',[property,actor,revision,write,JSON.stringify(source),JSON.stringify(payload),finish])).rows[0].v;
 const saved=await save();assert.equal(saved.showroom.revision,2);assert.equal(saved.receipt.sourceRevision,2);assert.equal(saved.showroom.draft_content.summary,'AI copy is not original');assert.equal((await save()).showroom.revision,2);assert.equal((await save()).replayed,true);
 await assert.rejects(save(1,original),/web_write_conflict/);
 assert.equal((await db.query('SELECT input_payload FROM property_web_input_versions WHERE property_id=$1 AND source_revision=1',[property])).rows[0].input_payload.providedText,original.providedText);
 const finishId=crypto.randomUUID();const closed=(await db.query('SELECT web_save_intake($1,$2,2,$3,$4::jsonb,$5::jsonb,$5::jsonb,true) v',[property,actor,finishId,JSON.stringify(revised),JSON.stringify(form)])).rows[0].v;assert.equal(closed.receipt.formClosed,true);assert.equal(closed.showroom.revision,3);
 const replay=(await db.query('SELECT web_find_intake_write($1,$2,1,$3,$4::jsonb,$5::jsonb,false) v',[property,actor,write,JSON.stringify(revised),JSON.stringify(form)])).rows[0].v;assert.equal(replay.appliedRevision,2);assert.equal(replay.showroom.revision,3);
 await assert.rejects(db.query('SELECT web_save_intake($1,$2,3,$3,$4::jsonb,$5::jsonb,$5::jsonb,false)',[property,actor,crypto.randomUUID(),JSON.stringify(revised),JSON.stringify(form)]),/web_form_closed/);
 await db.query("UPDATE property_showrooms SET showroom_status='published',published_content=$1::jsonb,published_revision=3,approved_by=$2,approved_at=now(),published_at=now() WHERE property_id=$3",[JSON.stringify({schema_version:'1.0',title:'approved'}),actor,property]);
 const sourceId=crypto.randomUUID(),sourceOnly={...original,mode:'materials',providedText:'PDF 원문 기준'};
 const sourceSave=async(rev=3,srev=2)=>(await db.query('SELECT web_save_source($1,$2,$3,$4,$5,$6::jsonb) v',[property,actor,rev,srev,sourceId,JSON.stringify(sourceOnly)])).rows[0].v;
 const changed=await sourceSave();assert.equal(changed.showroom.revision,4);assert.equal(changed.receipt.sourceRevision,3);assert.equal(changed.showroom.draft_content.summary,form.summary);assert.equal(changed.showroom.published_content.title,'approved');assert.equal((await sourceSave()).showroom.revision,4);
 await assert.rejects(db.query('SELECT web_save_source($1,$2,3,2,$3,$4::jsonb)',[property,actor,crypto.randomUUID(),JSON.stringify(original)]),/revision_conflict/);
 await assert.rejects(db.query('SELECT web_save_source($1,$2,4,3,$3,$4::jsonb)',[property,other,crypto.randomUUID(),JSON.stringify(original)]),/web_intake_missing/);
 assert.equal((await db.query('SELECT count(*)::int n FROM property_web_input_versions')).rows[0].n,3);
 for(const invalid of [{version:1,mode:'simple',providedText:'x'.repeat(16001)},{version:1,mode:'unknown',providedText:''},{version:1,mode:'simple',providedText:'',extra:'forged'}])await assert.rejects(db.query('SELECT web_assert_input($1::jsonb)',[JSON.stringify(invalid)]),/web_source_invalid/);
 await db.exec('RESET ROLE');for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);for(const sql of ['SELECT * FROM property_web_input_versions','SELECT * FROM property_web_intake_writes',`SELECT web_intake_receipt('${actor}','${request}',NULL)`,`SELECT web_create_intake('${request}','${actor}','{}','{}')`,`SELECT web_save_source('${property}','${actor}',1,1,'${request}','{}')`])await assert.rejects(db.query(sql),e=>e.code==='42501');await db.exec('RESET ROLE');}
 console.log('PASS intake recovery SQL: atomic creation, duplicate/response replay, original versions, actor scope, form close, source CAS, later revision replay, held AI and approval preservation, restricted roles');
}catch(e){console.error({name:e.name,message:e.message,code:e.code,position:e.position});process.exitCode=1;}finally{await db.close();}
