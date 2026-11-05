"""Create missing private drafts only; never update properties or existing showrooms."""
import base64
import json
import os
import re
from urllib.request import Request, build_opener, HTTPRedirectHandler

PROJECT = 'aklcylhqslgntkgloqpi'

def text(value, limit=2000):
    return value.strip()[:limit] if isinstance(value, str) else ''

def draft(prop):
    ai = prop.get('ai_contents')
    ai = ai if isinstance(ai, dict) else {}
    category = text(ai.get('property_category'))
    kind = next((label for pattern, label in [('공장|물류|창고','industrial'),('토지|임야','land'),('건물|수익형','income'),('상가|오피스','commercial')] if re.search(pattern, category)), 'unknown')
    headline = next((line.strip()[:100] for line in text(ai.get('landing_copy')).replace('\\n','\n').splitlines() if line.strip() and not line.strip().startswith('■')), '매물 정보 확인 필요')
    concepts = []
    source = ai.get('showroom_concepts')
    for i, value in enumerate((source if isinstance(source, list) else [])[:3]):
        item = value if isinstance(value, dict) else {}
        zones = item.get('zone_plan')
        zones = [v for v in (zones if isinstance(zones,list) else []) if isinstance(v,str) and v.strip()][:5]
        concepts.append({'id':f'concept-{i+1}','conceptName':text(item.get('concept_name'),100) or '활용 방향 확인 필요','headline':text(item.get('headline'),500),'rationale':text(item.get('cost_benefit')),'feasibility':'not_checked','zones':[{'id':f'zone-{i+1}-{j+1}','label':f'구역 {j+1}','title':text(v,120),'body':text(v),'indoorOutdoor':'unknown'} for j,v in enumerate(zones)]})
    return {'visualMode':'ai_generated','schema_version':'1.0','id':prop['id'],'category':kind,'title':'매물 검토 초안','subtitle':headline,'summary':text(ai.get('usp_summary')),'address':text(prop.get('address'),300),'addressEvidence':'owner_provided','facts':[],'concepts':concepts,'unknowns':['면적·가격·이용권·인허가와 자료 출처 확인 필요','AI 문구와 활용 방향은 미검증 가설입니다.'],'assets':[]}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def synchronize(api):
    def pages(path):
        offset = 0
        while True:
            rows = api(f'{path}&limit=100&offset={offset}')
            yield from rows
            if len(rows) < 100: break
            offset += 100
    existing = {row['property_id'] for row in pages('property_showrooms?select=property_id&order=property_id')}
    count = 0
    for prop in pages('properties?status=eq.analyzed&select=id,address,ai_contents&order=id'):
        if prop['id'] in existing: continue
        api('property_showrooms?on_conflict=property_id', {'property_id':prop['id'],'slug':'property-'+prop['id'],'showroom_status':'draft','draft_content':draft(prop)})
        existing.add(prop['id']); count += 1
    return count

def main():
    key = os.environ.get('SUPABASE_KEY','')
    url = os.environ.get('SUPABASE_URL','').rstrip('/')
    if url != f'https://{PROJECT}.supabase.co': raise ValueError('project_mismatch')
    secret = key.startswith('sb_secret_')
    if not secret:
        payload = json.loads(base64.urlsafe_b64decode(key.split('.')[1]+'==='))
        if payload.get('role') != 'service_role' or payload.get('ref') != PROJECT: raise ValueError('server_credential_required')
    headers = {'apikey':key,'Content-Type':'application/json'}
    if not secret: headers['Authorization'] = 'Bearer '+key
    opener = build_opener(NoRedirect())
    def api(path, body=None):
        request_headers = dict(headers)
        if body is not None: request_headers['Prefer'] = 'resolution=ignore-duplicates,return=minimal'
        req = Request(url+'/rest/v1/'+path,headers=request_headers,data=json.dumps(body).encode() if body is not None else None,method='POST' if body is not None else 'GET')
        with opener.open(req,timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw.strip() else None
    count = synchronize(api)
    print('Private draft sync completed; candidate creations:',count)

if __name__ == '__main__':
    try: main()
    except Exception:
        print('Private draft sync failed; no credentials or response data logged.')
        raise SystemExit(1)
