// Local-only harness for the generated Worker; backend calls are mocked by QA.
import http from 'node:http';
// The generated router also reads public metadata server-side. Keep that path
// synthetic so this local harness cannot contact the production project.
globalThis.fetch=async input=>{
  const url=new URL(String(input));
  if(url.hostname!=='aklcylhqslgntkgloqpi.supabase.co'||url.pathname!=='/functions/v1/public-showroom')throw Error('Nonlocal built QA request blocked');
  return Response.json({canonical_slug:url.searchParams.get('slug'),showroom:{title:'합성 빌드 검증',summary:'합성 자료'}});
};
const {default:worker}=await import('../dist/server/index.js');
const port=Number(process.env.SPACEPICK_QA_PORT||5174);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid local QA port');
const server=http.createServer(async(req,res)=>{
  try{
    const response=await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method}));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Local built Worker failed');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Built showroom Worker: http://127.0.0.1:${port}`));
