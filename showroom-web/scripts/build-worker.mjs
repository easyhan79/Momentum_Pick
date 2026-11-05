import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist');
const types={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2'};
const assets={};
function collect(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='server'||entry.name==='.openai'||entry.name==='index.html')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())collect(file);else{const key='/'+path.relative(dist,file).split(path.sep).join('/');assets[key]={type:types[path.extname(file)]||'application/octet-stream',data:fs.readFileSync(file).toString('base64')};}}}
collect(dist);const template=fs.readFileSync(path.join(dist,'index.html'),'utf8');const router=fs.readFileSync(path.join(root,'server/router.mjs'),'utf8');
const output=router+'\nconst embeddedAssets='+JSON.stringify(assets)+';\nconst template='+JSON.stringify(template)+';\nexport default {fetch:createSiteFetch(embeddedAssets,template)};\n';
fs.mkdirSync(path.join(dist,'server'),{recursive:true});fs.writeFileSync(path.join(dist,'server/index.js'),output);
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
// The Worker embeds every built asset; only generated output under this dist is removed.
for(const entry of fs.readdirSync(dist)){if(entry==='server'||entry==='.openai')continue;const target=path.resolve(dist,entry);if(!target.startsWith(dist+path.sep))throw Error('unsafe build path');fs.rmSync(target,{recursive:true,force:true});}
console.log('Spacepick Worker built with '+Object.keys(assets).length+' embedded assets ('+Buffer.byteLength(output)+' bytes)');
