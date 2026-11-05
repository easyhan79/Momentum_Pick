import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

// Ship fonts/decoders with the site. Customer PDF bytes never go to a CDN.
const require=createRequire(import.meta.url);
const root=path.dirname(require.resolve('pdfjs-dist/package.json'));
const {version}=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
export const pdfAssetPrefix=`/pdfjs/${version}/`;
export function pdfjsAssets(){
  const files=new Map();
  for(const directory of ['cmaps','standard_fonts','wasm']){
    for(const name of fs.readdirSync(path.join(root,directory))){
      if(!/\.(bcmap|pfb|ttf|otf|woff2?|wasm|js)$/.test(name)&&!name.startsWith('LICENSE'))continue;
      files.set(pdfAssetPrefix+directory+'/'+name,path.join(root,directory,name));
    }
  }
  files.set(pdfAssetPrefix+'LICENSE_PDFJS',path.join(root,'LICENSE'));
  return {name:'spacepick-private-pdf-assets',
    configureServer(server){server.middlewares.use((req,res,next)=>{
      const file=files.get((req.url||'').split('?')[0]);if(!file)return next();
      if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
      res.setHeader('X-Content-Type-Options','nosniff');
      if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
    });},
    generateBundle(){for(const [url,file] of files)this.emitFile({type:'asset',fileName:url.slice(1),source:fs.readFileSync(file)});},
  };
}
