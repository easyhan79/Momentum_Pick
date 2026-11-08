"""Bounded synthetic-only provider evaluation; never reads production data.

Requires an existing provider credential in the process environment. Results
contain only synthetic scenarios and scrubbed excerpts; no keys are printed.
"""
import io
import json
import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

CASES = [
    ('commercial-rich', '가상 사례: 상가 한 건물, 대지면적 400㎡, 건축면적 200㎡. 매매가 8억원. 1층은 공실이며 사용승인은 확인 중이다.'),
    ('commercial-sparse', '가상 사례: 상가를 매각하려 한다. 가격과 면적은 미상이다.'),
    ('factory-rich', '가상 사례: 공장 부지 2필지 600㎡와 400㎡, 건축면적 300㎡, 연면적 450㎡. 전체 매매가 12억원. 설비 용량은 미확인이다.'),
    ('factory-sparse', '가상 사례: 공장 매각. 정확한 주소와 면적, 허가 상태는 제공되지 않았다.'),
    ('logistics-rich', '가상 사례: 물류 용도의 건물. 제공 원문상 대지면적은 600㎡이며 PDF에는 580㎡라고 적혀 있다. 도로 지위와 차량 진입은 확인 전이다.'),
    ('logistics-sparse', '가상 사례: 물류 관련 부동산을 판매하려 한다. 면적과 가격은 미상이다.'),
    ('land-rich', '가상 사례: 토지 3필지 100평, 200㎡, 300㎡. 총 매매가는 6억원이며 개별 필지가격은 제공되지 않았다. 개발 허가는 확인 전이다.'),
    ('land-sparse', '가상 사례: 토지 매각. 소재지, 면적, 거래가격을 제공하지 않았다.'),
    ('income-rich', '가상 사례: 수익형 건물, 연면적 700㎡, 매매가 15억원. 임대 조건과 실제 수익률은 제공되지 않았다.'),
    ('income-sparse', '가상 사례: 임대 수익형 건물의 매각을 검토 중이다. 임대료와 수익률은 미상이다.'),
]


def excerpt(value, limit=500):
    value = str(value or '')[:limit]
    value = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[이메일 생략]', value)
    return re.sub(r'(?<!\d)(?:\+?82[- ]?)?0?1[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)', '[연락처 생략]', value)


def sample_pdf():
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject('/Type'):NameObject('/Font'), NameObject('/Subtype'):NameObject('/Type1'), NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    stream = DecodedStreamObject(); stream.set_data(b'BT /F1 18 Tf 72 720 Td (Synthetic document: land area 580 sqm.) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    target = io.BytesIO(); writer.write(target)
    return target.getvalue()


def run():
    report = {'synthetic':True,'expectedCases':len(CASES),'cases':[],'vision':None}
    output = Path(os.environ.get('PILOT_REPORT', 'v2-pilot-report.json'))
    def save(): output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    if not os.environ.get('GEMINI_API_KEY'):
        report['error']='provider_not_configured'; save(); print('provider_not_configured'); return 2
    import requests
    from PIL import Image, ImageDraw
    from ai_providers import ProviderError
    from analysis_worker import PROMPT, analyze_job, generation_services
    from sales_analysis import V2_PROMPT, validate_v2_candidates
    from vision_analysis import vision_service
    environment = {**os.environ,'AI_PROVIDER_ORDER':'gemini','AI_STOP_ON_UNCERTAIN':'true'}
    if os.environ.get('PILOT_DIAGNOSE_SCHEMA')=='true':
        from google import genai
        from google.genai import types
        from analysis_worker import UniversalMarketingPackageV2
        try:
            with genai.Client(api_key=environment['GEMINI_API_KEY'],http_options=types.HttpOptions(timeout=90000,retry_options=types.HttpRetryOptions(attempts=1))) as client:
                client.models.generate_content(model=environment.get('GEMINI_MODEL','gemini-3.8-flash'),contents=['Synthetic schema diagnostic: return an example.'],config=types.GenerateContentConfig(response_mime_type='application/json',response_json_schema=UniversalMarketingPackageV2.model_json_schema(),temperature=0.1,max_output_tokens=2048))
            report['diagnostic']={'status':'accepted'};save();print('schema_diagnostic accepted');return 0
        except Exception as exc:
            message=str(getattr(exc,'message',''))[:1500].replace(environment['GEMINI_API_KEY'],'[redacted]')
            message=re.sub(r'https?://\S+','[url]',message)
            report['diagnostic']={'status':'rejected','code':getattr(exc,'code',None),'message':message};save();print('schema_diagnostic',json.dumps(report['diagnostic'],ensure_ascii=False));return 1
    if os.environ.get('PILOT_SKIP_VISION')=='true':
        report['vision']={'status':'skipped','reason':'validated_in_separate_run'}
    else:
        try:
            img=Image.new('RGB',(600,400),'white');draw=ImageDraw.Draw(img);draw.rectangle((90,120,510,320),outline='black',width=8);draw.rectangle((180,170,280,320),fill='gray');draw.text((110,70),'SYNTHETIC SAMPLE',fill='black')
            image=io.BytesIO();img.save(image,format='PNG');v=vision_service(environment,requests)(image.getvalue())
            report['vision']={'classification':v['classification'],'observations':[excerpt(x,180) for x in v['observations'][:3]],'limitations':[excerpt(x,180) for x in v['limitations'][:3]]}
        except Exception as exc:
            report['error']=exc.safe_code if isinstance(exc,ProviderError) else type(exc).__name__;save();print('vision_failed',report['error']);return 1
    generate,validate,edit=generation_services(environment,requests,use_v2=True)
    pdf=sample_pdf()
    for name,raw in CASES:
        property_id=str(uuid.uuid4());version=f'{property_id}:1';doc_id=str(uuid.uuid4());documents=[{'assetId':doc_id}] if name=='logistics-rich' else []
        sources={'inputVersionId':version,'pdfs':[doc_id] if documents else [],'images':[]}
        job={'id':property_id,'raw_input':raw+'\n허용된 출처 ID: '+json.dumps(sources,ensure_ascii=False)+('\n[DOCUMENT_ID:'+doc_id+']' if documents else '')}
        try:
            result=analyze_job(job,generate,lambda _:None,validate,edit,lambda *_:{'data':pdf,'mime_type':'application/pdf'},prompt=PROMPT+V2_PROMPT)
            result=validate_v2_candidates(result,version,documents,[])
            bundle=result['listing_bundle'];strategy=result['sales_strategy']
            report['cases'].append({'name':name,'status':'ok','headline':excerpt(result.get('landing_copy')),'summary':excerpt(result.get('usp_summary')),'positioning':excerpt(strategy.get('positioning')),'sellingPoints':[{'fact':excerpt(p.get('fact'),250),'benefit':excerpt(p.get('buyerBenefit'),250)} for p in strategy.get('sellingPoints',[])], 'constraints':[excerpt(x.get('description'),250) for x in strategy.get('materialConstraints',[])], 'parcels':len(bundle['parcels']),'buildings':len(bundle['buildings']),'conflicts':len(bundle['conflicts']),'priceClaims':len(bundle['priceClaims']),'cardMarkers':len(re.findall(r'\[카드\s*[1-5]\]',result.get('insta_caption',''))),'blogLengths':[len(result.get('target_1_blog','')),len(result.get('target_2_blog',''))]})
            print(name,'ok',flush=True);save()
        except Exception as exc:
            code=exc.safe_code if isinstance(exc,ProviderError) else type(exc).__name__
            report['cases'].append({'name':name,'status':'failed','error':code});report['error']='pilot_stopped_on_first_failure';save();print(name,'failed',code,flush=True);return 1
    save();return 0


if __name__ == '__main__':
    raise SystemExit(run())
