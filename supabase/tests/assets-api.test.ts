import {test} from 'node:test';import assert from 'node:assert/strict';import {createAssetsHandler,imageType} from '../functions/showroom-assets/index.ts';
const id='23d0b6b1-f48f-491a-b897-a3d4c749c559',assetId='5cce37b0-0146-4ba2-9a9e-e9542784d71e';
const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);
function upload(mime='image/png',bytes=png){const form=new FormData();form.set('file',new Blob([bytes],{type:mime}),'PRIVATE-NAME.png');form.set('kind','photo');form.set('source_type','owner_provided');form.set('caption','의뢰인 제공·검토 필요');return new Request(`https://x.test?action=upload&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user'},body:form});}
function harness(user:unknown={id,app_metadata:{showroom_admin:true}},rest:(path:string,init:RequestInit)=>Response|Promise<Response>=()=>Response.json([])){
 const calls:string[]=[];return{calls,handler:createAssetsHandler({url:'https://db.test',key:'SECRET',fetcher:(async(url,init)=>{const path=String(url);if(path.endsWith('/auth/v1/user'))return Response.json(user,{status:user?200:401});calls.push(path);return rest(path,init||{});}) as typeof fetch})};
}
test('deferred uploads store private media without enqueuing billable images or plan analysis',async()=>{
 const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'synthetic.png');form.set('kind','provided_plan');form.set('source_type','owner_provided');form.set('caption','합성 제공자료');form.set('defer_generation','true');
 const h=harness(undefined,(path,init)=>{
  if(path.includes('/properties?'))return Response.json([{id}]);
  if(path.includes('/bucket/'))return Response.json({public:false});
  if(path.includes('/object/'))return Response.json({});
  if(path.endsWith('/property_assets')){assert.equal(JSON.parse(String(init.body)).is_approved,false);return new Response(null,{status:201});}
  throw Error('Unexpected enqueue/read '+path);
 });
 const r=await h.handler(new Request(`https://x.test?action=upload&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user'},body:form}));assert.equal(r.status,201);
 const result=await r.json();assert.equal(result.analysis,'not_requested');assert.equal(result.dispatched,false);assert.ok(h.calls.every(path=>!path.includes('/rpc/')&&!path.includes('property_showrooms')));
});
test('PDF uploads are private documents and can only be downloaded through the authenticated scoped endpoint',async()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7\nsynthetic');let stored='';
 const h=harness(undefined,(path,init)=>{
  if(path.includes('/properties?'))return Response.json([{id}]);
  if(path.includes('/bucket/'))return Response.json({public:false});
  if(path.includes('/object/')){if(init.method==='POST'){assert.equal(new Headers(init.headers).get('Content-Type'),'application/pdf');return Response.json({});}return new Response(bytes);}
  if(path.endsWith('/property_assets')){const a=JSON.parse(String(init.body));assert.equal(a.kind,'document');assert.equal(a.is_approved,false);stored=a.storage_path;assert.match(stored,/\.pdf$/);return new Response(null,{status:201});}
  if(path.includes('/property_assets?')){assert.match(path,/kind=eq.document/);assert.match(path,new RegExp('property_id=eq.'+id));return Response.json([{storage_path:stored}]);}
  throw Error('unexpected '+path);
 });
 const form=new FormData();form.set('file',new Blob([bytes],{type:'application/pdf'}),'PRIVATE-NAME.pdf');form.set('kind','document');form.set('source_type','owner_provided');form.set('caption','제공 PDF');
 const uploadRequest=new Request(`https://x.test?action=upload&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user'},body:form});
 const uploaded=await h.handler(uploadRequest);assert.equal(uploaded.status,201);const result=await uploaded.json();assert.equal(result.dispatched,false);assert.ok(h.calls.every(p=>!p.includes('/rpc/')));
 const downloaded=await h.handler(new Request(`https://x.test?action=document&propertyId=${id}&assetId=${result.id}`,{headers:{Authorization:'Bearer user'}}));
 assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('content-type'),'application/pdf');assert.match(downloaded.headers.get('content-disposition')||'',/attachment/);assert.doesNotMatch(downloaded.headers.get('content-disposition')||'',/PRIVATE-NAME/);assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),bytes);
 const denied=await h.handler(new Request(`https://x.test?action=document&propertyId=${id}&assetId=${result.id}`));assert.equal(denied.status,401);
});
test('media endpoints require actual admin and reject spoofed claims, anon and cross-origin',async()=>{
 for(const user of [null,{id,user_metadata:{showroom_admin:true}},{id,app_metadata:{}},{id,is_anonymous:true,app_metadata:{showroom_admin:true}}]){const h=harness(user);assert.ok([401,403].includes((await h.handler(upload())).status));assert.equal(h.calls.length,0);}
 const h=harness();assert.equal((await h.handler(new Request(`https://x.test?propertyId=${id}`,{headers:{Origin:'https://evil.test'}}))).status,403);assert.equal(h.calls.length,0);
});
test('media list returns metadata without storage paths or public URLs',async()=>{
 const h=harness(undefined,(path)=>{if(path.includes('/properties?'))return Response.json([{id}]);assert.match(path,/bucket_id=eq.showroom-private-media/);assert.doesNotMatch(path,/select=.*storage_path/);return Response.json([]);});const r=await h.handler(new Request(`https://x.test?action=list&propertyId=${id}`,{headers:{Authorization:'Bearer user'}}));assert.equal(r.status,200);assert.match(r.headers.get('cache-control')!,/no-store/);
});
test('image signatures and declared MIME must match; SVG and oversized uploads are blocked',async()=>{
 assert.equal(imageType(png)?.mime,'image/png');assert.equal(imageType(new TextEncoder().encode('<svg>bad</svg>')),null);
 const h=harness(undefined,()=>Response.json([{id}]));assert.equal((await h.handler(upload('image/jpeg'))).status,415);assert.equal((await h.handler(upload('image/svg+xml',new TextEncoder().encode('<svg>bad</svg>')))).status,415);
 const large=new Request(`https://x.test?action=upload&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'multipart/form-data; boundary=a','Content-Length':String(9*1024*1024)},body:'small'});assert.equal((await h.handler(large)).status,413);assert.ok(h.calls.every(p=>p.includes('/properties?')));
});
test('upload stores random private path, strips original name and never approves or modifies property',async()=>{
 let created=false,inserted=false;
 const h=harness(undefined,(path,init)=>{if(path.includes('/properties?'))return Response.json([{id}]);if(path.endsWith('/bucket/showroom-private-media'))return created?Response.json({public:false}):new Response('{}',{status:404});if(path.endsWith('/bucket')){const body=JSON.parse(init.body as string);assert.equal(body.public,false);assert.equal(body.file_size_limit,8388608);created=true;return Response.json({});}if(path.includes('/object/')){assert.equal(init.method,'POST');assert.match(path,new RegExp(`${id}/[0-9a-f-]+\\.png$`));assert.doesNotMatch(path,/PRIVATE-NAME/);return Response.json({});}if(path.endsWith('/property_assets')){const body=JSON.parse(init.body as string);assert.equal(body.is_approved,false);assert.equal(body.property_id,id);assert.equal(body.caption,'의뢰인 제공·검토 필요');inserted=true;return new Response(null,{status:201});}throw Error('unexpected');});assert.equal((await h.handler(upload())).status,201);assert.ok(created&&inserted);
});
test('public bucket configuration blocks upload',async()=>{const h=harness(undefined,path=>Response.json(path.includes('/properties?')?[{id}]:{public:true}));assert.equal((await h.handler(upload())).status,503);assert.ok(!h.calls.some(p=>p.includes('/object/')));});
test('private image proxy scopes asset to property, validates path and returns bytes without credentials',async()=>{
 const h=harness(undefined,path=>{if(path.includes('/properties?'))return Response.json([{id}]);if(path.includes('/property_assets?')){assert.match(path,new RegExp(`property_id=eq.${id}`));return Response.json([{storage_path:`${id}/${assetId}.png`}]);}return new Response(png);});const r=await h.handler(new Request(`https://x.test?action=image&propertyId=${id}&assetId=${assetId}`,{headers:{Authorization:'Bearer user'}}));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),png);
 const bad=harness(undefined,path=>Response.json(path.includes('/properties?')?[{id}]:[{storage_path:'../secret.png'}]));assert.equal((await bad.handler(new Request(`https://x.test?action=image&propertyId=${id}&assetId=${assetId}`,{headers:{Authorization:'Bearer user'}}))).status,404);
});
test('metadata failure cleans only newly generated private object and returns sanitized failure',async()=>{
 let uploadedPath='',removed='';const h=harness(undefined,(path,init)=>{if(path.includes('/properties?'))return Response.json([{id}]);if(path.includes('/bucket/'))return Response.json({public:false});if(path.endsWith('/property_assets'))return new Response('SECRET',{status:500});if(init.method==='DELETE'){removed=JSON.parse(init.body as string).prefixes[0];return Response.json({});}uploadedPath=path.split('/showroom-private-media/')[1];return Response.json({});});const r=await h.handler(upload());assert.equal(r.status,502);assert.equal(removed,uploadedPath);assert.doesNotMatch(await r.text(),/SECRET/);
});
test('classifying imported image scopes the write and cannot approve or publish',async()=>{
 const h=harness(undefined,(path,init)=>{if(path.includes('/properties?'))return Response.json([{id}]);assert.match(path,new RegExp(`id=eq.${assetId}&property_id=eq.${id}&bucket_id=eq.showroom-private-media`));assert.match(path,/source_type=neq.ai_generated&kind=neq.concept/);assert.equal(init.method,'PATCH');assert.deepEqual(JSON.parse(init.body as string),{kind:'photo'});return Response.json([{id:assetId,kind:'photo'}]);});
 const request=new Request(`https://x.test?action=classify&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'application/json'},body:JSON.stringify({assetId,kind:'photo',is_approved:true})});assert.equal((await h.handler(request)).status,200);
 const invalid=new Request(`https://x.test?action=classify&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({assetId,kind:'published'})});assert.equal((await h.handler(invalid)).status,400);
});
