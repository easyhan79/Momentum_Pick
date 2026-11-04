import {PGlite} from '@electric-sql/pglite';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO service_role;
CREATE TABLE properties(id uuid PRIMARY KEY);
CREATE TABLE property_showrooms(property_id uuid PRIMARY KEY, draft_content jsonb,revision int DEFAULT 1,published_content jsonb);
CREATE TABLE property_assets(id uuid PRIMARY KEY,property_id uuid,kind text,bucket_id text,storage_path text,source_type text,caption text,created_at timestamptz DEFAULT now());
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
await db.exec(await readFile(new URL('../review/image_package.sql',import.meta.url),'utf8'));
const pid=crypto.randomUUID(),source=crypto.randomUUID();
await db.query('INSERT INTO properties VALUES($1)',[pid]);await db.query("INSERT INTO property_showrooms(property_id,draft_content,published_content) VALUES($1,$2,$3)",[pid,{title:'keep',concepts:[1,2,3].map(n=>({id:'concept-'+n})),assets:[]},{title:'frozen'}]);
await db.query("INSERT INTO property_assets VALUES($1,$2,'photo','showroom-private-media','original.png','owner_provided','source',now())",[source,pid]);
const enqueue=async(slot='hero',retry=false)=>(await db.query('SELECT image_enqueue($1,$2,$3) j',[pid,slot,retry])).rows[0].j;
const claim=async(id)=>(await db.query('SELECT image_claim($1) j',[id])).rows[0].j;
const complete=async(j,asset=null)=>(await db.query("SELECT image_complete($1,$2,$3,'{}',$4) ok",[j.id,j.claim_token,asset,asset?'':'test_failure'])).rows[0].ok;
const hero=await enqueue();assert.equal((await enqueue()).id,hero.id);let j=await claim(hero.id);assert.equal(await claim(hero.id),null);assert.equal((await db.query('SELECT reserved_krw FROM property_image_budgets')).rows[0].reserved_krw,500);
assert.equal(await complete({...j,claim_token:crypto.randomUUID()}),false);await complete(j);await enqueue('hero',true);j=await claim(hero.id);
const generated=crypto.randomUUID();await db.query("INSERT INTO property_assets VALUES($1,$2,'concept','showroom-private-media','generated.png','ai_generated','AI example',now())",[generated,pid]);assert.equal(await complete(j,generated),true);
assert.equal((await enqueue('hero',true)).state,'done');assert.equal(await claim(hero.id),null);
const room=(await db.query('SELECT * FROM property_showrooms')).rows[0];assert.equal(room.draft_content.heroAsset.id,generated);assert.equal(room.draft_content.assets.length,2);assert.equal(room.draft_content.title,'keep');assert.equal(room.published_content.title,'frozen');
for(const slot of ['concept-1','concept-2','concept-3']){const item=await enqueue(slot);await complete(await claim(item.id));}
assert.equal((await db.query('SELECT reserved_krw FROM property_image_budgets')).rows[0].reserved_krw,2500);
const retry=await enqueue('concept-1',true);assert.equal(await claim(retry.id),null);assert.equal((await db.query('SELECT reserved_krw FROM property_image_budgets')).rows[0].reserved_krw,2500);
for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM property_image_budgets'));await assert.rejects(db.query('SELECT image_claim($1)',[hero.id]));await db.exec('RESET ROLE');}
console.log('Image budget: singleton hero, CAS, nonrefundable reservations, cap, draft attachment and access checks passed');await db.close();
