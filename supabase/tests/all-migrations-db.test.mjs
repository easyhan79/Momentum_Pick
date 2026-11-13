// Every migration must apply in order to an empty database (with minimal Supabase stubs),
// and the production-only functions recovered on 2026-11-13 must match the production export.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const dir=new URL('../migrations/',import.meta.url);
const norm=s=>s.replace(/--[^\n]*/g,'').replace(/\s+/g,'').toLowerCase();

test('all migrations apply in order and recreate the production v2 functions exactly',async()=>{
  const db=new PGlite();
  // Objects Supabase or the legacy bot provide outside these migrations.
  await db.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),address text,raw_input text,status text,ai_contents jsonb,created_at timestamptz DEFAULT now());
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;`);
  const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();
  assert.ok(files.length>=24);
  for(const f of files)await assert.doesNotReject(db.exec(await readFile(new URL(f,dir),'utf8')),f);
  for(const table of ['web_submission_sessions','property_editor_versions','property_channel_releases','web_worker_dispatch_leases'])
    assert.equal((await db.query(`select to_regclass('public.${table}') r`)).rows[0].r,table,table);
  const exported=await readFile(new URL('../review/production_v2_functions_20261112.sql',import.meta.url),'utf8');
  for(const name of ['web_automatic_apply','web_automatic_image_enqueue','web_automatic_next','web_save_editor_v2']){
    const r=await db.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,[name]);
    const start=exported.indexOf(`-- ${name}\n`),end=exported.indexOf('\n-- ',start+5);
    const production=exported.slice(start,end<0?undefined:end).replace(`-- ${name}`,'').replace(/;\s*$/,'');
    assert.equal(norm(r.rows[0].d),norm(production),name);
  }
  await db.close();
});
