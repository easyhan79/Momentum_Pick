import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
try{
 await db.exec("CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean,allowed_mime_types text[]);INSERT INTO storage.buckets VALUES('showroom-private-media',false,ARRAY['image/png']);");
 const sql=await readFile(new URL('../migrations/20261105160000_private_pdf_uploads.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 let row=(await db.query('SELECT * FROM storage.buckets')).rows[0];assert.equal(row.public,false);assert.deepEqual(row.allowed_mime_types,['image/png','application/pdf']);
 await db.exec('UPDATE storage.buckets SET allowed_mime_types=NULL');await db.exec(sql);assert.equal((await db.query('SELECT * FROM storage.buckets')).rows[0].allowed_mime_types,null);
 await db.exec("UPDATE storage.buckets SET public=true,allowed_mime_types=ARRAY['image/jpeg']");await db.exec(sql);row=(await db.query('SELECT * FROM storage.buckets')).rows[0];assert.equal(row.public,true);assert.deepEqual(row.allowed_mime_types,['image/jpeg']);
 console.log('PASS private PDF bucket migration: additive MIME, repeatability, NULL preservation and no changes to public bucket settings');
}catch(error){console.error({message:error.message,code:error.code});process.exitCode=1;}finally{await db.close();}
