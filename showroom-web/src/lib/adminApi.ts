export const PROJECT_URL='https://aklcylhqslgntkgloqpi.supabase.co';
// Public client configuration only. Never put server secrets here.
let publicKey='';
type Session={access_token:string;refresh_token:string;expires_at:number};
let session:Session|null=null;
let refreshing:Promise<void>|null=null;
async function key(){if(!publicKey){const r=await fetch('/supabase-public.json',{cache:'no-store'});if(!r.ok)throw Error('로그인 설정을 불러오지 못했습니다.');const data=await r.json();if(typeof data.publishableKey!=='string'||!data.publishableKey)throw Error('관리자 로그인 설정이 준비 중입니다.');publicKey=data.publishableKey;}return publicKey;}
async function tokenRequest(path:string,body:unknown){const response=await fetch(`${PROJECT_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:await key(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('로그인 정보를 확인해 주세요. 계정이 없으면 관리자 등록이 필요합니다.');const result=await response.json();session={access_token:result.access_token,refresh_token:result.refresh_token,expires_at:Date.now()+result.expires_in*1000};}
export async function login(email:string,password:string){await tokenRequest('token?grant_type=password',{email,password});}
export async function requestPasswordReset(email:string){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('이메일을 먼저 입력해 주세요.');
  const configuration:{recoveryRedirect?:string}=await fetch('/site-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():{}).catch(()=>({}));
  const redirect=configuration.recoveryRedirect||'https://momentum-pick-showroom-20261102.ljc3534.chatgpt.site/?admin=1&reset=1';
  const response=await fetch(`${PROJECT_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',headers:{apikey:await key(),'Content-Type':'application/json'},body:JSON.stringify({email}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('재설정 메일을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
export async function setRecoveredPassword(accessToken:string,password:string){
  if(password.length<12)throw Error('새 비밀번호는 12자 이상으로 입력해 주세요.');
  const headers={apikey:await key(),Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'};
  const verified=await fetch(`${PROJECT_URL}/auth/v1/user`,{headers,signal:AbortSignal.timeout(10000)});
  if(!verified.ok)throw Error('재설정 링크가 만료됐습니다. 새 메일을 요청해 주세요.');
  const response=await fetch(`${PROJECT_URL}/auth/v1/user`,{method:'PUT',headers,body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('비밀번호를 변경하지 못했습니다. 새 비밀번호 조건 또는 링크 만료 여부를 확인해 주세요.');
  await fetch(`${PROJECT_URL}/auth/v1/logout`,{method:'POST',headers,signal:AbortSignal.timeout(10000)}).catch(()=>{});
  session=null;
}
export async function logout(){const current=session;session=null;if(current)await fetch(`${PROJECT_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:await key(),Authorization:`Bearer ${current.access_token}`},signal:AbortSignal.timeout(10000)}).catch(()=>{});}
async function userHeaders(){
  if(!session)throw Error('다시 로그인해 주세요.');
  if(session.expires_at<Date.now()+60000){refreshing??=tokenRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).finally(()=>{refreshing=null;});await refreshing;}
  if(!session)throw Error('다시 로그인해 주세요.');
  return {apikey:await key(),Authorization:`Bearer ${session.access_token}`};
}
export async function mediaRequest(query:string,body?:FormData|Record<string,unknown>):Promise<Response>{
  const json=body&&!(body instanceof FormData);
  const response=await fetch(`${PROJECT_URL}/functions/v1/showroom-assets?${query}`,{method:body?'POST':'GET',headers:{...await userHeaders(),...(json?{'Content-Type':'application/json'}:{})},...(body?{body:json?JSON.stringify(body):body as FormData}:{}),signal:AbortSignal.timeout(60000)});
  if(!response.ok){const errors:Record<number,string>={401:'로그인이 만료되었습니다. 다시 로그인해 주세요.',403:'관리자만 자료를 사용할 수 있습니다.',404:'자료를 찾을 수 없습니다.',413:'이미지는 8MB 이하로 선택해 주세요.',415:'JPEG·PNG·WebP 이미지만 사용할 수 있습니다.'};throw Error(errors[response.status]||'자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');}return response;
}
export async function crm<T>(query:string,body?:unknown):Promise<T>{
  const response=await fetch(`${PROJECT_URL}/functions/v1/showroom-crm?${query}`,{method:body?'POST':'GET',headers:{...await userHeaders(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){const messages:Record<number,string>={400:'입력 항목과 금액을 확인해 주세요.',401:'로그인이 만료되었습니다. 다시 로그인해 주세요.',403:'관리자만 문의를 관리할 수 있습니다.',404:'문의 또는 연결할 매물 초안이 없습니다.',409:'수정 버전이 바뀌었거나 보관기간이 끝났습니다. 최신 내용을 다시 불러와 주세요.'};throw Error(messages[response.status]||'문의를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');}return response.json();
}
export async function api<T>(action:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`${PROJECT_URL}/functions/v1/showroom-admin${method==='GET'?`?${action}`:''}`,{method,headers:{...await userHeaders(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(!response.ok){const payload=await response.json().catch(()=>({}));const planErrors:Record<string,string>={slug_taken:'다른 매물이 사용했거나 예약한 주소입니다. 다른 이름을 선택해 주세요.',invalid_slug:'주소는 영문 소문자·숫자·하이픈 3~64자로 입력해 주세요. admin 등 서비스 주소는 사용할 수 없습니다.',image_generation_pending:'이미지 생성이 완료된 뒤 미리보기를 확인하고 승인해 주세요.',invalid_media:'연결된 이미지 자료를 확인해 주세요.',plan_analysis_pending:'도면 분석이 대기·진행 중이거나 실패했습니다. 도면 편집에서 상태와 재시도를 확인하세요.',plan_positions_required:'도면의 모든 구역 번호 위치를 확인하고 저장해 주세요.',plan_already_running:'이미 도면을 분석 중입니다. 결과를 기다려 주세요.',plan_revision_conflict:'분석 결과 또는 초안 버전이 바뀌었습니다. 최신 저장본을 불러와 주세요.',plan_asset_missing:'해당 매물의 도면을 찾을 수 없습니다. 자료 목록을 새로고침해 주세요.'};if(planErrors[payload.error])throw Error(planErrors[payload.error]);const errors:Record<number,string>={401:'로그인이 만료되었습니다. 다시 로그인해 주세요.',403:'관리자로 등록된 계정만 접근할 수 있습니다.',404:'초안이 없습니다. 분석 완료 매물의 초안을 생성해 주세요.',409:'분석 상태 또는 수정 버전이 바뀌었습니다. 새로고침한 뒤 다시 확인해 주세요.'};throw Error(errors[response.status]||'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
  return response.json();
}
