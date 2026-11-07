export const PRODUCTION_URL='https://aklcylhqslgntkgloqpi.supabase.co';
export function clientDeployment(value:{environment?:string;url?:string;publishableKey?:string;privatePreview?:string}){
 const environment=value.environment||'production',url=value.url||PRODUCTION_URL;
 if(!['production','staging','test'].includes(environment)||!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(url))throw Error('사이트 연결 설정을 확인해 주세요.');
 if(environment==='production'&&url!==PRODUCTION_URL||environment!=='production'&&(url===PRODUCTION_URL||value.privatePreview!=='true'||!value.publishableKey))throw Error('시험 사이트와 운영 데이터 연결이 섞여 있습니다.');
 if(value.publishableKey?.startsWith('sb_secret_')||value.publishableKey&&/^ey/.test(value.publishableKey)&&(()=>{try{return JSON.parse(atob(value.publishableKey.split('.')[1])).role==='service_role';}catch{return true;}})())throw Error('공개 로그인 설정에 서버 키를 사용할 수 없습니다.');
 return {environment,url,publishableKey:value.publishableKey||'',privatePreview:environment!=='production'};
}
