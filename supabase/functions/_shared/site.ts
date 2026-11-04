export const PRIMARY_ORIGIN='https://spacepick.kr';
export const LEGACY_ORIGIN='https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site';
const origins=new Set([PRIMARY_ORIGIN,'https://www.spacepick.kr',LEGACY_ORIGIN]);
export function originAllowed(origin:string|null){return origin===null||origins.has(origin);}
export function corsOrigin(origin:string|null){return origin&&origins.has(origin)?origin:undefined;}
export const reservedSlugs=new Set(['admin','api','assets','about','contact','samples','login','reset','signin-with-chatgpt','signout-with-chatgpt','callback','robots','sitemap']);
export function validSlug(slug:unknown):slug is string{return typeof slug==='string'&&slug.length>=3&&slug.length<=64&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)&&!reservedSlugs.has(slug);}
export function slugSuggestions(draft:Record<string,any>,id:string,ai:unknown=[]){
 const text=[draft.address,draft.title,draft.subtitle].filter(Boolean).join(' ');
 const regions:[RegExp,string][]=[[/안성/,'anseong'],[/서울/,'seoul'],[/용인/,'yongin'],[/수원/,'suwon'],[/전주/,'jeonju'],[/부산/,'busan'],[/인천/,'incheon'],[/대전/,'daejeon'],[/천안/,'cheonan'],[/평택/,'pyeongtaek']];
 const region=regions.find(([pattern])=>pattern.test(text))?.[1]||'space';
 const purpose=/물류|창고/.test(text)?'logistics':draft.category==='industrial'?'factory':draft.category==='land'?'land':draft.category==='commercial'?'plaza':'building';
 const suffix=id.replace(/-/g,'').slice(0,4);
 const named=/terrace\s*201|테라스\s*201/i.test(text)?'terrace201':`${region}-${purpose}`;
 return [...new Set([...(Array.isArray(ai)?ai:[]),named,`${named}-${suffix}`,`${region}-space-${suffix}`].filter(validSlug))].slice(0,3);
}
