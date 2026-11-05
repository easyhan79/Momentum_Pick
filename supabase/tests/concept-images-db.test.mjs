import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),property='10000000-0000-4000-8000-000000000001',asset='20000000-0000-4000-8000-000000000002';
try{
 await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);INSERT INTO auth.users VALUES('${property}');CREATE TABLE properties(id uuid PRIMARY KEY);INSERT INTO properties VALUES('${property}');GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;GRANT SELECT ON properties TO service_role;`);
 for(const file of ['20261102115440_showroom_private_schema.sql','20261104110833_bounded_image_package.sql','20261105105931_generated_spatial_images.sql','20261105150000_concept_edit_consistency.sql','20261105151000_generated_image_classification.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const original={schema_version:'1.0',title:'original',concepts:[{id:'concept-1',conceptName:'old'}],assets:[{id:asset,conceptId:'concept-1',generated:true}]};
 await db.query("INSERT INTO property_showrooms(property_id,slug,draft_content,showroom_status,published_content,published_revision,approved_by,approved_at,published_at) VALUES($1,'factory',$2::jsonb,'published',$2::jsonb,1,$1,now(),now())",[property,JSON.stringify(original)]);
 await db.query("INSERT INTO property_assets(id,property_id,kind,bucket_id,storage_path,source_type) VALUES($1::uuid,$2::uuid,'concept','showroom-private-media',$2::text||'/'||$1::text||'.png','ai_generated')",[asset,property]);
 await db.query('INSERT INTO property_image_budgets(property_id,reserved_krw) VALUES($1,1000)',[property]);
 await db.query("INSERT INTO property_image_jobs(property_id,slot,state,asset_id,usage) VALUES($1,'concept-1','done',$2,'{\"cost\":500}')",[property,asset]);
 await db.exec('SET ROLE service_role');
 const edited={...original,concepts:[{id:'concept-1',conceptName:'new'}]};
 const saved=(await db.query('SELECT showroom_save_concept_draft($1,1,$2::jsonb,$3::text[]) r',[property,JSON.stringify(edited),['concept-1']])).rows[0].r;
 assert.equal(saved.revision,2);assert.deepEqual(saved.draft_content.assets,[]);assert.deepEqual(saved.published_content,original);
 let job=(await db.query('SELECT * FROM property_image_jobs')).rows[0];assert.equal(job.state,'failed');assert.equal(job.asset_id,null);assert.equal(job.last_error_code,'concept_changed');assert.equal(job.usage.cost,500);
 assert.equal((await db.query('SELECT reserved_krw FROM property_image_budgets')).rows[0].reserved_krw,1000);
 await db.query('SELECT image_sync_assets($1)',[property]);assert.deepEqual((await db.query('SELECT draft_content FROM property_showrooms')).rows[0].draft_content.assets,[]);
 await assert.rejects(db.query('SELECT showroom_save_concept_draft($1,1,$2::jsonb,$3::text[])',[property,JSON.stringify(edited),['concept-1']]),/revision_conflict/);
 await db.query("SELECT image_enqueue($1,'concept-1',true)",[property]);
 job=(await db.query('SELECT image_claim($1) r',[job.id])).rows[0].r;assert.equal(job.state,'running');
 await assert.rejects(db.query('SELECT showroom_save_concept_draft($1,2,$2::jsonb,$3::text[])',[property,JSON.stringify(edited),['concept-1']]),/concept_image_busy/);
 assert.equal((await db.query('SELECT revision FROM property_showrooms')).rows[0].revision,2);
 await db.query("SELECT image_complete($1,$2,$3,'{\"image_type\":\"photo\"}'::jsonb,'')",[job.id,job.claim_token,asset]);
 assert.equal((await db.query('SELECT draft_content FROM property_showrooms')).rows[0].draft_content.assets[0].imageType,'photo');
 await db.exec('RESET ROLE');for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT showroom_save_concept_draft($1,2,$2::jsonb,$3::text[])',[property,JSON.stringify(edited),['concept-1']]),error=>error.code==='42501');await db.exec('RESET ROLE');}
 console.log('PASS concept edit: invalidates old slot images, keeps originals and budget/history, preserves published snapshot, revision checks, running-job block, role permissions');
}catch(error){console.error({message:error.message,code:error.code,detail:error.detail});process.exitCode=1;}finally{await db.close();}
