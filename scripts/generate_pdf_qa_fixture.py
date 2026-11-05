"""Build valid synthetic Korean PDFs and real local citation-check fixtures.

No model/service calls. Generated files stay under ignored test-results.
"""
import base64
import json
from pathlib import Path
import sys
from io import BytesIO
from pypdf import PdfReader,PdfWriter

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from tests.pdf_fixtures import pdf_bytes
from pdf_evidence import inspect_pdf,citation_checks,document_summaries

property_id='10000000-0000-4000-8000-000000000001'
asset_id='20000000-0000-4000-8000-000000000002'
encrypted_id='30000000-0000-4000-8000-000000000003'
pdf=pdf_bytes(('토지면적 1,000㎡ · 지상 4층','건축 설명에는 지상 3층으로 표기',''),scanned_pages=(3,))
report=inspect_pdf(pdf)
interactive=PdfWriter(clone_from=PdfReader(BytesIO(pdf)))
interactive.add_js("globalThis.__PDF_SCRIPT_RAN__=true;fetch('https://pdf-script.invalid/blocked');")
interactive.add_uri(0,'https://pdf-link.invalid/blocked',[20,700,300,780])
interactive_output=BytesIO();interactive.write(interactive_output)
facts=[
 dict(key='floor_structure',label='층수',value='지상 4층',unit='',source_index=1,page=1,quote='지상 4층',missing=False),
 dict(key='floor_structure',label='층수',value='지상 3층',unit='',source_index=1,page=2,quote='지상 3층',missing=False),
 dict(key='land_area',label='토지면적',value='9,999',unit='㎡',source_index=1,page=1,quote='토지면적 1,000㎡',missing=False),
 dict(key='lease_period',label='계약기간',value='10년',unit='',source_index=1,page=3,quote='계약기간 10년',missing=False),
 dict(key='building_use',label='건축물 용도',value='창고',unit='',source_index=1,page=99,quote='창고',missing=False),
]
ai={'document_facts':facts,'_document_checks':citation_checks(facts,{1:report}),
    '_document_inspections':document_summaries({1:report}),
    '_document_sources':[{'source_index':1,'asset_id':asset_id,'property_id':property_id}]}
fixture={'propertyId':property_id,'assetId':asset_id,'encryptedId':encrypted_id,'pdfBase64':base64.b64encode(pdf).decode(),
         'pdfSha256':report['sha256'],'encryptedBase64':base64.b64encode(pdf_bytes(encrypted=True)).decode(),
         'interactiveBase64':base64.b64encode(interactive_output.getvalue()).decode(),'ai':ai}
destination=ROOT/'showroom-web/test-results/v2-pdf/fixture.json'
destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n')
print('Synthetic PDF fixture saved:',destination)
