import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const actor=crypto.randomUUID(),other=crypto.randomUUID(),worker=crypto.randomUUID();
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${actor}'),('${other}');CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;GRANT SELECT,INSERT,UPDATE ON properties TO service_role;GRANT SELECT ON auth.users TO service_role;`);
 for(const f of ['20261102115440_showroom_private_schema.sql','20261103115337_analysis_recovery_queue.sql','20261105140000_web_property_registration.sql','20261107040000_web_intake_recovery.sql','20261107050000_web_processing_runs.sql'])await db.exec(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 await db.exec('SET ROLE service_role');
 const rpc=async(name,args)=>(await db.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args.map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;
 const content={schema_version:'1.0',title:'existing title',summary:'edited copy',concepts:[],propertyProfile:{version:1,fields:[]},registration:{channel:'web',rightsApproved:true}},source={version:1,mode:'simple',providedText:'immutable original'};
 const first=await rpc('web_create_intake',[crypto.randomUUID(),actor,content,source]),id=first.receipt.propertyId;
 await rpc('web_save_intake',[id,actor,1,crypto.randomUUID(),source,content,content,true]);
 await db.query(`UPDATE property_showrooms SET showroom_status='published',published_content=$1::jsonb,published_revision=2,approved_by='${actor}',approved_at=now(),published_at=now() WHERE property_id=$2`,[JSON.stringify(content),id]);
 const request=crypto.randomUUID(),spec={draftRevision:2,sourceRevision:1,documentIds:[]};
 const queue=()=>rpc('web_queue_processing',[id,actor,request,2,1,spec,'frozen original',[]]);
 assert.equal((await queue()).queued,true);assert.equal((await queue()).queued,false);
 assert.equal(await rpc('analysis_claim',[]),null); // Actions cannot steal web work.
 await assert.rejects(rpc('web_processing_receipt',[id,other,request,spec]),/web_intake_missing/);
 await assert.rejects(rpc('web_processing_receipt',[id,actor,request,{...spec,documentIds:[crypto.randomUUID()]}]),/processing_request_conflict/);
 let job=await rpc('web_analysis_claim',[worker]);assert.equal(job.raw_input,'frozen original');assert.equal(job.attempt,1);assert.equal(await rpc('web_analysis_claim',[worker]),null);
 assert.equal(await rpc('web_analysis_progress',[id,crypto.randomUUID(),'generating',null]),false);
 assert.equal(await rpc('web_analysis_progress',[id,job.token,'generating',null]),true);
 assert.equal(await rpc('web_analysis_progress',[id,job.token,'heartbeat',null]),true);
 assert.equal((await db.query('SELECT phase FROM property_processing_runs WHERE id=$1',[request])).rows[0].phase,'generating');
 const result={usp_summary:'new copy',landing_copy:'new headline',showroom_concepts:[]};
 assert.equal(await rpc('web_analysis_progress',[id,job.token,'saving',result]),true);
 await db.query("UPDATE property_analysis_jobs SET lease_until=now()-interval '1 second' WHERE property_id=$1",[id]);
 const oldToken=job.token;job=await rpc('web_analysis_claim',[worker]);assert.deepEqual(job.candidate,result);assert.equal(job.attempt,2);
 assert.equal(await rpc('web_analysis_complete',[id,oldToken,result,'',false]),false);
 assert.equal(await rpc('web_analysis_complete',[id,job.token,result,'',false]),true);
 assert.equal((await db.query('SELECT ai_contents FROM properties WHERE id=$1',[id])).rows[0].ai_contents,null);
 assert.equal((await db.query('SELECT revision FROM property_showrooms WHERE property_id=$1',[id])).rows[0].revision,2);
 // Result only enters current content when explicitly applied; public stays frozen.
 const applied=await rpc('web_apply_processing',[id,actor,request,2,{...content,summary:'new copy'},'{}']);assert.equal(applied.revision,3);assert.equal(applied.published_content.summary,'edited copy');
 assert.equal((await rpc('web_apply_processing',[id,actor,request,2,{},'{}'])).revision,3);
 assert.deepEqual((await db.query('SELECT ai_contents FROM properties WHERE id=$1',[id])).rows[0].ai_contents,result);
 const r2=crypto.randomUUID();await rpc('web_queue_processing',[id,actor,r2,3,1,{draftRevision:3,sourceRevision:1},'second original',[]]);job=await rpc('web_analysis_claim',[worker]);
 await rpc('web_analysis_progress',[id,job.token,'generating',null]);await db.query("UPDATE property_analysis_jobs SET lease_until=now()-interval '1 second' WHERE property_id=$1",[id]);assert.equal(await rpc('web_analysis_claim',[worker]),null);
 assert.equal((await db.query('SELECT last_error_code FROM property_processing_runs WHERE id=$1',[r2])).rows[0].last_error_code,'outcome_unknown');
 const r3=crypto.randomUUID();await rpc('web_queue_processing',[id,actor,r3,3,1,{draftRevision:3,sourceRevision:1},'third original',[]]);job=await rpc('web_analysis_claim',[worker]);await rpc('web_cancel_processing',[id,actor,r3]);assert.equal(await rpc('web_analysis_complete',[id,job.token,result,'',false]),false);
 await assert.rejects(rpc('web_queue_processing',[id,actor,crypto.randomUUID(),3,1,{draftRevision:3,sourceRevision:1},'fourth',[]]),/processing_rate_limited/);
 await rpc('web_worker_heartbeat',[worker,'local-test','test','{analysis}',null]);
 await db.exec('RESET ROLE');for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);for(const sql of ['SELECT * FROM property_processing_runs','SELECT * FROM web_worker_heartbeats',`SELECT web_analysis_claim('${worker}')`])await assert.rejects(db.query(sql),e=>e.code==='42501');await db.exec('RESET ROLE');}
 console.log('PASS processing SQL: frozen input, replay, route fence, single claim, durable candidate recovery, stale token, explicit apply, published preservation, uncertain paid outcome, cancel, request cap, restricted roles');
}catch(e){console.error({name:e.name,message:e.message,code:e.code,position:e.position});process.exitCode=1;}finally{await db.close();}
