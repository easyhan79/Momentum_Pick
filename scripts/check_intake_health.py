"""Print only configuration booleans/status codes; never credential-bearing errors."""
import os,json,urllib.request
base=os.environ['SUPABASE_URL'].rstrip('/')
if base!='https://aklcylhqslgntkgloqpi.supabase.co':raise SystemExit('project_mismatch')
try:
 req=urllib.request.Request(base+'/functions/v1/clever-endpoint',headers={'Authorization':'Bearer '+os.environ['SUPABASE_KEY'],'apikey':os.environ['SUPABASE_KEY']})
 with urllib.request.urlopen(req,timeout=15) as response:
  flags=json.load(response)
 print('intake configuration '+json.dumps({k:flags.get(k) is True for k in ['telegram_configured','dispatch_configured','webhook_secret_configured']}))
except Exception:print('intake configuration check unavailable')
try:
 req=urllib.request.Request('https://api.telegram.org/bot'+os.environ['TELEGRAM_TOKEN']+'/getMe')
 with urllib.request.urlopen(req,timeout=15) as response:valid=json.load(response).get('ok') is True
 print('worker telegram credential valid='+str(valid).lower())
except Exception:print('worker telegram credential valid=false')
