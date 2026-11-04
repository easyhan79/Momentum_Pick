import {useState} from 'react';
import {parseRecoveryFragment} from '../lib/recoverySession';
import {setRecoveredPassword} from '../lib/adminApi';
// Capture once before React's StrictMode mounts; remove credentials from the URL immediately.
const recovery=parseRecoveryFragment(location.hash);
history.replaceState(null,'',location.pathname+location.search);
export function ResetPasswordPage(){
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
  return <main className="admin-shell"><a className="brand-word" href="/?admin=1">SPACE<span>PICK</span></a><h1>새 비밀번호 설정</h1><section className="glass admin-login">{done?<><h2>설정 완료</h2><p>새 비밀번호로 관리자 화면에 로그인해 주세요.</p><a className="button button-gold" href="/?admin=1">관리자 로그인으로 이동</a></>:!recovery?<><p role="alert">유효한 재설정 링크가 없습니다. 로그인 화면에서 새 메일을 요청해 주세요.</p><a href="/?admin=1">로그인 화면으로 이동</a></>:<form onSubmit={async e=>{e.preventDefault();setError('');if(password!==confirm){setError('두 비밀번호가 일치하지 않습니다.');return;}setBusy(true);try{await setRecoveredPassword(recovery.access_token,password);setDone(true);}catch(e){setError(e instanceof Error?e.message:'설정하지 못했습니다.');}finally{setPassword('');setConfirm('');setBusy(false);}}}><p>웹쇼룸 관리자 계정의 비밀번호를 설정합니다. Supabase 대시보드 비밀번호는 바뀌지 않습니다.</p><label htmlFor="new-password">새 비밀번호 · 12자 이상</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)} /><label htmlFor="confirm-password">새 비밀번호 확인</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} /><button className="button button-gold" disabled={busy}>{busy?'설정 중…':'새 비밀번호 저장'}</button>{error&&<p className="admin-message admin-error" role="alert">{error}</p>}</form>}</section></main>;
}
