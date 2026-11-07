import {clientDeployment} from '../src/lib/deployment.ts';
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist');
const types={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
const assets={};
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='server'||entry.name==='.openai'||entry.name==='index.html')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())collect(file);else{const key='/'+path.relative(dist,file).split(path.sep).join('/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}}}
const deployment=clientDeployment({environment:process.env.VITE_SPACEPICK_ENV,url:process.env.VITE_SUPABASE_URL,publishableKey:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,privatePreview:process.env.VITE_PRIVATE_PREVIEW});
collect(dist);if(deployment.privatePreview)assets['/supabase-public.json']={type:'application/json',data:Buffer.from(JSON.stringify({publishableKey:deployment.publishableKey})).toString('base64')};const template=fs.readFileSync(path.join(dist,'index.html'),'utf8');const router=fs.readFileSync(path.join(root,'server/router.mjs'),'utf8');
const output=`${router}
const embeddedAssets=${JSON.stringify(assets)};
const template=${JSON.stringify(template)};
const site=createSiteFetch(embeddedAssets,template);
export default {fetch:(request,env={})=>site(request,{...env,SPACEPICK_SUPABASE_URL:${JSON.stringify(deployment.url)},SPACEPICK_PRIVATE_PREVIEW:${JSON.stringify(deployment.privatePreview)}||env.SPACEPICK_PRIVATE_PREVIEW==='true'?'true':'false'})};
`;
fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.writeFileSync(path.join(dist,'server/index.js'),output);
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});
if(deployment.privatePreview){const project=process.env.SPACEPICK_PREVIEW_PROJECT_ID;if(!/^appgprj_[a-z0-9]+$/.test(project||'')||project===JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8')).project_id)throw Error('A separate private preview hosting project is required');fs.writeFileSync(path.join(dist,'.openai/hosting.json'),JSON.stringify({project_id:project}));}else fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
// The Worker embeds every built asset; only generated output under this dist is removed.
for(const entry of fs.readdirSync(dist)){if(entry==='server'||entry==='.openai')continue;const target=path.resolve(dist,entry);if(!target.startsWith(dist+path.sep))throw Error('unsafe build path');fs.rmSync(target,{recursive:true,force:true});}
console.log('Spacepick Worker built with '+Object.keys(assets).length+' embedded assets ('+Buffer.byteLength(output)+' bytes)');
