"""Read-only intake diagnostics using the existing Actions bindings.

Prints only fixed verdict codes/booleans/HTTP status codes. Never prints tokens,
URLs, usernames, response bodies, customer records or exception messages.
Does not send messages, modify webhooks, claim work or change project data.
"""
import json
import os
import re
from urllib.error import HTTPError
from urllib.request import Request,HTTPRedirectHandler,build_opener

PROJECT='aklcylhqslgntkgloqpi'
BASE=f'https://{PROJECT}.supabase.co'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


def read(url,headers=None,method='GET',opener=None):
    try:
        with (opener or build_opener(NoRedirect())).open(Request(url,headers=headers or {},method=method),timeout=15) as response:
            raw=response.read(65536) if method!='HEAD' else b''
            return response.status,json.loads(raw) if raw else {}
    except HTTPError as error:
        return error.code,{}
    except Exception:
        return 0,{}


def diagnose(environment,reader=read):
    result={}
    token=environment.get('TELEGRAM_TOKEN','')
    if not token or not re.fullmatch(r'[0-9]+:[A-Za-z0-9_-]+',token):
        result['bot']='BOT_UNCONFIGURED'
        result['webhook']='HOOK_UNCHECKED'
    else:
        status,body=reader(f'https://api.telegram.org/bot{token}/getMe')
        result['bot']='BOT_OK' if status==200 and body.get('ok') is True else f'BOT_HTTP_{status}'
        status,body=reader(f'https://api.telegram.org/bot{token}/getWebhookInfo')
        info=body.get('result') if body.get('ok') is True else None
        if status!=200 or not isinstance(info,dict):
            result['webhook']=f'HOOK_HTTP_{status}'
        else:
            url=info.get('url','')
            result['webhook']='HOOK_MISSING' if not url else 'HOOK_TARGET_OK' if url.rstrip('/')==BASE+'/functions/v1/clever-endpoint' else 'HOOK_TARGET_OTHER'
            result['pending_updates']=isinstance(info.get('pending_update_count'),int) and info['pending_update_count']>0
            error=info.get('last_error_message','')
            match=re.search(r'\b([45][0-9]{2})\b',error)
            result['webhook_last_error']='NONE' if not error else 'HTTP_'+match.group(1) if match else 'REPORTED'
    key=environment.get('SUPABASE_KEY','')
    if environment.get('SUPABASE_URL','').rstrip('/')!=BASE or not key:
        result['intake']='EDGE_BINDING_UNAVAILABLE'
        result['database']='DB_UNCHECKED'
    else:
        headers={'apikey':key}
        if not key.startswith('sb_secret_'):
            headers['Authorization']='Bearer '+key
        status,body=reader(BASE+'/functions/v1/clever-endpoint',{**headers,'Authorization':'Bearer '+key})
        result['intake']='EDGE_OK' if status==200 else f'EDGE_HTTP_{status}'
        if status==200:
            for name in ['telegram_configured','dispatch_configured','webhook_secret_configured']:
                result[name]=body.get(name) is True
        status,_=reader(BASE+'/rest/v1/properties?select=id&limit=0',headers,method='HEAD')
        result['database']='DB_ACCESS_OK' if status in (200,206) else f'DB_HTTP_{status}'
    return result


def write_report(result,environment):
    parts=[result['bot'],result['webhook'],result.get('webhook_last_error','NONE'),result['intake'],result['database']]
    if 'telegram_configured' in result and not result['telegram_configured']:
        parts.append('EDGE_BOT_UNCONFIGURED')
    verdict='__'.join(parts)
    if not re.fullmatch(r'[A-Z0-9_]{1,250}',verdict):
        raise ValueError('invalid_diagnostic_verdict')
    print(json.dumps(result,sort_keys=True))
    if environment.get('GITHUB_OUTPUT'):
        with open(environment['GITHUB_OUTPUT'],'a') as output:
            output.write('verdict='+verdict+'\n')
    if environment.get('GITHUB_STEP_SUMMARY'):
        with open(environment['GITHUB_STEP_SUMMARY'],'a') as output:
            output.write('## Read-only intake diagnostics\n\n```json\n'+json.dumps(result,indent=2,sort_keys=True)+'\n```\n\nNo messages sent; no webhook, queue or customer data changed.\n')
    return verdict


if __name__=='__main__':
    write_report(diagnose(os.environ),os.environ)
