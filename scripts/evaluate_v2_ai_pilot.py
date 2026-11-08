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


def scrub(value):
    if isinstance(value,dict): return {k:scrub(v) for k,v in value.items()}
    if isinstance(value,list): return [scrub(v) for v in value]
    if isinstance(value,str):
        value=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[이메일 생략]',value)
        return re.sub(r'(?<!\d)(?:\+?82[- ]?)?0?1[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)', '[연락처 생략]',value)
    return value


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
    if os.environ.get('PILOT_SKIP_VISION')=='true':
        report['vision']={'status':'skipped','reason':'validated_in_separate_run'}
    else:
        try:
            img=Image.new('RGB',(600,400),'white');draw=ImageDraw.Draw(img);draw.rectangle((90,120,510,320),outline='black',width=8);draw.rectangle((180,170,280,320),fill='gray');draw.text((110,70),'SYNTHETIC SAMPLE',fill='black')
            image=io.BytesIO();img.save(image,format='PNG');v=vision_service(environment,requests)(image.getvalue())
            report['vision']={'classification':v['classification'],'observations':[excerpt(x,180) for x in v['observations'][:3]],'limitations':[excerpt(x,180) for x in v['limitations'][:3]]}
        except Exception as exc:
            report['error']=exc.safe_code if isinstance(exc,ProviderError) else type(exc).__name__;save();print('vision_failed',report['error']);return 1
    record = None
    def capture_output(value):
        if record is not None:
            try:
                record['raw']=scrub(json.loads(value))
                record['status']='generated'
            except (ValueError,TypeError):
                record['rawFormat']='invalid_json'
            save()
    generate,validate,edit=generation_services(environment,requests,use_v2=True,observe_output=capture_output)
    pdf=sample_pdf()
    start = int(os.environ.get('PILOT_START_INDEX', '0'))
    limit = int(os.environ.get('PILOT_CASE_LIMIT', str(len(CASES) - start)))
    if start < 0 or limit < 1 or start + limit > len(CASES):
        raise ValueError('invalid_pilot_case_range')
    report['caseRange'] = [start, start + limit]
    failed = False
    for name,raw in CASES[start:start + limit]:
        property_id=str(uuid.uuid4());version=f'{property_id}:1';doc_id=str(uuid.uuid4());documents=[{'assetId':doc_id}] if name=='logistics-rich' else []
        sources={'inputVersionId':version,'pdfs':[doc_id] if documents else [],'images':[]}
        job={'id':property_id,'raw_input':raw+'\n허용된 출처 ID: '+json.dumps(sources,ensure_ascii=False)+('\n[DOCUMENT_ID:'+doc_id+']' if documents else '')}
        record={'name':name,'status':'started','inputVersionId':version,'documents':documents}
        report['cases'].append(record);save()
        try:
            result=analyze_job(job,generate,lambda _:None,validate,edit,lambda *_:{'data':pdf,'mime_type':'application/pdf'},prompt=PROMPT+V2_PROMPT)
            result=validate_v2_candidates(result,version,documents,[])
            bundle=result['listing_bundle'];strategy=result['sales_strategy']
            record.update({'status':'ok','headline':excerpt(result.get('landing_copy')),'summary':excerpt(result.get('usp_summary')),'positioning':excerpt(strategy.get('positioning')),'sellingPoints':[{'fact':excerpt(p.get('fact'),250),'benefit':excerpt(p.get('buyerBenefit'),250)} for p in strategy.get('sellingPoints',[])], 'constraints':[excerpt(x.get('description'),250) for x in strategy.get('materialConstraints',[])], 'parcels':len(bundle['parcels']),'buildings':len(bundle['buildings']),'conflicts':len(bundle['conflicts']),'priceClaims':len(bundle['priceClaims']),'cardMarkers':len(re.findall(r'\[카드\s*[1-5]\]',result.get('insta_caption',''))),'blogLengths':[len(result.get('target_1_blog','')),len(result.get('target_2_blog',''))],'editorial':result.get('_editorial',{})})
            print(name,'ok',flush=True);save()
        except Exception as exc:
            safe=str(exc) if isinstance(exc,ValueError) and re.fullmatch(r'v2_[a-z_]+',str(exc)) else type(exc).__name__
            code=exc.safe_code if isinstance(exc,ProviderError) else safe
            failed=True
            record.update({'status':'failed','error':code});save();print(name,'failed',code,flush=True)
            # A response received but rejected can be diagnosed offline while
            # independent cases proceed. Unknown provider outcomes stop calls.
            if isinstance(exc,ProviderError) and 'raw' not in record and 'rawFormat' not in record:
                report['error']='pilot_stopped_on_provider_failure';save();return 1
            if not isinstance(exc,(ProviderError,ValueError)):
                report['error']='pilot_stopped_on_unexpected_error';save();return 1
    save();return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(run())
