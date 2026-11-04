const PUBLIC_API='https://aklcylhqslgntkgloqpi.supabase.co/functions/v1/public-showroom';
const SLUG=/^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED=new Set(['api','assets','login','reset','robots','sitemap','callback','signin-with-chatgpt','signout-with-chatgpt']);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=value=>String(value||'').replace(/\\r\\n|\\n/g,' ').replace(/\s+/g,' ').trim();
export function createSiteFetch(assets,template,fetcher=fetch){
 const decoded=new Map();
 return async function handle(request,env={}){
  const url=new URL(request.url),path=url.pathname;
  if(url.hostname==='www.spacepick.kr')return new Response(null,{status:308,headers:{Location:'https://spacepick.kr'+url.pathname+url.search}});
  const origin=env.SPACEPICK_PUBLIC_ORIGIN==='https://spacepick.kr'?'https://spacepick.kr':url.origin;
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const redirect=(target,status=301)=>new Response(null,{status,headers:{Location:target,'Cache-Control':'no-store'}});
  if(path==='/site-config.json')return Response.json({publicOrigin:origin,recoveryRedirect:env.SPACEPICK_RECOVERY_REDIRECT||'https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site/?admin=1&reset=1'},{headers:{'Cache-Control':'no-store'}});
  if(path==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /samples\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
  if(assets[path]){const asset=assets[path];if(!decoded.has(path))decoded.set(path,Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)));return new Response(request.method==='HEAD'?null:decoded.get(path),{headers:{'Content-Type':asset.type,'Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=300','X-Content-Type-Options':'nosniff'}});}
  function html({title='Spacepick | 공간의 가능성을, 근거와 함께',description='스페이스픽은 매물 자료와 활용 아이디어를 정리해 매물별 웹쇼룸과 광고 콘텐츠를 만드는 서비스입니다.',image=origin+'/spacepick-share.png',canonical=origin+'/',index=true,status=200,summary='' }={}){
    const metadata=`<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${index?'index, follow':'noindex, nofollow'}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:site_name" content="SPACEPICK"><meta property="og:type" content="website"><meta property="og:locale" content="ko_KR"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:card" content="summary_large_image">`;
    const base=template.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\s+[^>]*(?:name=["'](?:description|robots)["']|property=["']og:[^"']+["'])[^>]*>/gi,'');
    const output=base.replace('</head>',metadata+'</head>').replace('</body>',summary?`<noscript><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></main></noscript></body>`:'</body>');
    return new Response(request.method==='HEAD'?null:output,{status,headers});
  }
  if(path==='/about'||path==='/contact')return redirect('/#'+path.slice(1));
  if(path==='/admin/'||path==='/admin/reset/')return redirect(path.slice(0,-1)+url.search);
  if(path==='/admin'||path==='/admin/reset'||path.startsWith('/samples/')||url.searchParams.has('fixture')||url.searchParams.has('admin')||url.searchParams.has('reset'))return html({index:false});
  let slug;
  try{slug=url.searchParams.has('p')?url.searchParams.get('p'):decodeURIComponent(path.slice(1)).replace(/\/$/,'');}catch{return html({title:'페이지를 찾을 수 없습니다 | Spacepick',index:false,status:404});}
  if(path==='/'&&!url.searchParams.has('p'))return html();
  if(!slug||slug.length>120||!SLUG.test(slug.toLowerCase())||RESERVED.has(slug.toLowerCase()))return html({title:'페이지를 찾을 수 없습니다 | Spacepick',index:false,status:404});
  let result;
  try{const response=await fetcher(PUBLIC_API+'?slug='+encodeURIComponent(slug.toLowerCase()),{redirect:'error',signal:AbortSignal.timeout(10000)});if(response.status===404)return html({title:'현재 볼 수 없는 매물 | Spacepick',index:false,status:404});if(!response.ok)throw Error('unavailable');result=await response.json();}catch{return html({title:'잠시 후 다시 확인해 주세요 | Spacepick',index:false,status:503});}
  const canonical=result.canonical_slug||slug.toLowerCase();
  if(!SLUG.test(canonical)||canonical.length>120)return html({index:false,status:503});
  const suffix=new URLSearchParams();for(const key of ['source','utm_source','utm_medium','utm_campaign']){const value=url.searchParams.get(key);if(value)suffix.set(key,value.slice(0,100));}
  if(path!=='/'+canonical||url.searchParams.has('p'))return redirect('/'+canonical+(suffix.size?'?'+suffix:''));
  if(result.closed)return html({title:'거래가 완료된 매물입니다 | Spacepick',description:'이 매물은 거래가 완료되어 신규 문의 접수를 마감했습니다.',canonical:origin+'/'+canonical});
  const room=result.showroom;if(!room)return html({index:false,status:404});
  const name=room.title&&room.title!=='매물 검토 초안'?room.title:room.subtitle;
  return html({title:clean(name).slice(0,100)+' | Spacepick',description:clean(room.summary).slice(0,180),image:room.heroAsset?.approved&&room.heroAsset?.url||origin+'/spacepick-share.png',canonical:origin+'/'+canonical,summary:room.summary});
 };
}
