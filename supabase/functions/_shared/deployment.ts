// Owner-only staging guards. Defaults preserve the existing production path.
export const PRODUCTION_PROJECT_URL='https://aklcylhqslgntkgloqpi.supabase.co';
export type PreviewConfig={url:string;privatePreview?:boolean;previewOwnerId?:string;previewOrigin?:string};
export function previewConfigured(c:PreviewConfig){
 if(!c.privatePreview)return true;
 return /^https:\/\/[a-z]{20}\.supabase\.co$/.test(c.url)&&c.url!==PRODUCTION_PROJECT_URL
  &&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.previewOwnerId||'')
  &&/^https:\/\/[a-z0-9.-]+$/.test(c.previewOrigin||'')&&!['https://spacepick.kr','https://www.spacepick.kr','https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site'].includes(c.previewOrigin||'');
}
export function previewOriginAllowed(c:PreviewConfig,origin:string|null){return previewConfigured(c)&&(origin===null||origin===c.previewOrigin);}
export function previewOwnerAllowed(c:PreviewConfig,userId:string){return !c.privatePreview||previewConfigured(c)&&userId===c.previewOwnerId;}
export function previewEnvironment(env:{get(n:string):string|undefined}){return {privatePreview:env.get('PRIVATE_PREVIEW_ENABLED')==='true',previewOwnerId:env.get('PRIVATE_PREVIEW_OWNER_ID'),previewOrigin:env.get('PRIVATE_PREVIEW_ORIGIN')};}
