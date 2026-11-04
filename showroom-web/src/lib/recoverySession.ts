export type RecoverySession={access_token:string;refresh_token:string;expires_at:number};
export function parseRecoveryFragment(fragment:string,now=Date.now()):RecoverySession|null {
  if(fragment.length>24000)return null;
  const values=new URLSearchParams(fragment.replace(/^#/,''));
  const access=values.get('access_token'),refresh=values.get('refresh_token');
  if(values.get('type')!=='recovery'||!access||!refresh||access.length>16000||refresh.length>2000)return null;
  const seconds=Number(values.get('expires_in')||'3600');
  if(!Number.isFinite(seconds)||seconds<=0||seconds>86400)return null;
  return {access_token:access,refresh_token:refresh,expires_at:now+seconds*1000};
}
