import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHandler} from '../functions/showroom-admin/index.ts';
import {createAssetsHandler} from '../functions/showroom-assets/index.ts';
import {createPublicHandler} from '../functions/public-showroom/index.ts';
const id='5f0c0bc1-9dc7-496c-8511-0e9ecc066f17',asset='3408c9f7-3e76-466a-b5a3-8b020c3043df';
const admin={id,app_metadata:{showroom_admin:true}};
test('generation API only queues a fixed slot and does not publish or call model',async()=>{
 const calls:string[]=[];const handler=createHandler({url:'https://db',key:'server',fetcher:(async(url,init)=>{const p=String(url);if(p.endsWith('/auth/v1/user'))return Response.json(admin);calls.push(p);if(p.endsWith('/rpc/image_enqueue')){assert.deepEqual(JSON.parse(init!.body as string),{p_property:id,p_slot:'hero',p_retry:false});return Response.json({id:asset,state:'queued'});}if(p.endsWith('/rpc/image_sync_assets'))return Response.json(null);throw Error('unexpected');}) as typeof fetch});
 const req=(slot:string)=>new Request('https://x',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({action:'generate-image',propertyId:id,slot})});
 assert.equal((await handler(req('arbitrary-model'))).status,400);assert.equal(calls.length,0);
 const r=await handler(req('hero'));assert.equal(r.status,200);assert.equal((await r.json()).dispatched,false);assert.ok(calls.every(p=>!p.includes('published')&&!p.includes('googleapis')));
});
test('photo upload requests exactly one shared hero and preserves original bytes',async()=>{
 let queued=0;const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);
 const handler=createAssetsHandler({url:'https://db',key:'server',fetcher:(async(url,init)=>{const p=String(url);if(p.endsWith('/auth/v1/user'))return Response.json(admin);if(p.includes('/properties?'))return Response.json([{id}]);if(p.includes('/bucket/'))return Response.json({public:false});if(p.includes('/object/'))return Response.json({}, {status:201});if(p.endsWith('/property_assets'))return Response.json({}, {status:201});if(p.endsWith('/rpc/image_enqueue')){queued++;assert.equal(JSON.parse(init!.body as string).p_slot,'hero');return Response.json({id:asset,state:'queued'});}if(p.endsWith('/rpc/image_sync_assets'))return Response.json(null);throw Error('unexpected');}) as typeof fetch});
 for(let i=0;i<2;i++){const form=new FormData();form.set('file',new Blob([png],{type:'image/png'}),'source.png');form.set('kind','photo');form.set('source_type','owner_provided');form.set('caption','제공 사진');const r=await handler(new Request(`https://x?action=upload&propertyId=${id}`,{method:'POST',headers:{Authorization:'Bearer user'},body:form}));assert.equal(r.status,201);assert.equal((await r.json()).imageStatus,'queued');}assert.equal(queued,2);
});
test('approved media and hero get scoped URLs; draft-only media remain inaccessible',async()=>{
 const content={schema_version:'1.0',id,title:'매물',subtitle:'제목',assets:[{id:asset,kind:'concept',generated:true,approved:true,caption:'AI 대표',url:'PRIVATE-STORAGE-PATH'},{id,approved:false,url:'PRIVATE'}],heroAsset:{id:asset}};
 let storage=0;const handler=createPublicHandler('https://db','server',(async(url)=>{const p=String(url);if(p.includes('property_showrooms'))return Response.json([{approved_by:'admin',approved_at:'now',published_at:'now',published_revision:4,published_content:content}]);if(p.includes('property_assets')){assert.match(p,new RegExp(`property_id=eq.${id}`));return Response.json([{storage_path:`${id}/${asset}.png`}]);}storage++;return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});}) as typeof fetch);
 const dto=await (await handler(new Request('https://x?slug=test-property'))).json();assert.equal(dto.showroom.assets.length,1);assert.equal(dto.showroom.heroAsset.generated,true);assert.ok(!JSON.stringify(dto).includes('PRIVATE'));
 assert.equal((await handler(new Request(`https://x?slug=test-property&image=${asset}`))).status,200);assert.equal((await handler(new Request(`https://x?slug=test-property&image=${id}`))).status,404);assert.equal(storage,1);
});

test('missing generation source returns an actionable error without leaking database details',async()=>{
 const handler=createHandler({url:'https://db',key:'SECRET',fetcher:(async url=>String(url).endsWith('/auth/v1/user')?Response.json(admin):Response.json({code:'P0001',message:'source_missing',details:'PRIVATE'},{status:400})) as typeof fetch});
 const r=await handler(new Request('https://x',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({action:'generate-image',propertyId:id,slot:'hero'})}));assert.equal(r.status,400);assert.deepEqual(await r.json(),{error:'source_missing'});
});
