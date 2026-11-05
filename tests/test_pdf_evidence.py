import hashlib
import subprocess
import unittest
from unittest.mock import patch
from io import BytesIO
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject
from pdf_evidence import inspect_pdf,citation_checks,candidate_fingerprint,document_summaries,PdfInspectionError,MAX_PAGE_STREAM
from tests.pdf_fixtures import pdf_bytes
from analysis_worker import run


def candidate(**changes):
    return {**dict(key='land_area',label='토지면적',value='1,000',unit='㎡',source_index=1,page=1,quote='토지면적 1,000㎡',missing=False),**changes}


class PdfEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pdf=pdf_bytes(('토지면적 1,000㎡ · 지상 4층','임대차 종료일 확인 필요'))
        cls.report=inspect_pdf(cls.pdf)

    def test_valid_korean_pdf_text_digest_and_exact_page(self):
        self.assertEqual(self.report['page_count'],2)
        self.assertEqual(self.report['sha256'],hashlib.sha256(self.pdf).hexdigest())
        self.assertIn('토지면적 1,000㎡',self.report['pages'][0]['text'])
        result=citation_checks([candidate()],{1:self.report})[0]
        self.assertEqual(result['status'],'quote_matched')
        summary=document_summaries({1:self.report})[0]
        self.assertNotIn('text',summary);self.assertNotIn('토지면적',str(summary))

    def test_wrong_page_hallucinated_quote_and_value_are_distinct(self):
        cases=[({'page':3},'page_out_of_range'),({'page':2},'quote_not_found'),({'quote':'토지면적 9,999㎡'},'quote_not_found'),({'value':'2,000'},'value_not_in_quote'),({'unit':'평'},'unit_not_in_quote'),({'quote':''},'quote_missing')]
        for changes,expected in cases:
            data={**candidate(),**changes}
            self.assertEqual(citation_checks([data],{1:self.report})[0]['status'],expected)
        self.assertEqual(citation_checks([candidate()],{})[0]['status'],'not_checked')

    def test_whitespace_and_compatible_unicode_do_not_change_numbers(self):
        data={**candidate(),'quote':'토지면적\n 1,000m2'}
        self.assertEqual(citation_checks([data],{1:self.report})[0]['status'],'quote_matched')
        self.assertNotEqual(candidate_fingerprint(candidate()),candidate_fingerprint({**candidate(),'value':'2,000'}))
        self.assertEqual(candidate_fingerprint(candidate(unit='m2',quote='Site area 1,000 m2')),'02d8fc9a1fca70721ffbfe66cd353805c49d2c76da7d9ad73375ee2263e42ca2')

    def test_scanned_and_overlarge_content_remain_review_needed(self):
        scanned=inspect_pdf(pdf_bytes(scanned=True))
        self.assertEqual(scanned['pages'][0]['status'],'no_extractable_text')
        self.assertEqual(citation_checks([candidate()],{1:scanned})[0]['status'],'no_extractable_text')
        writer=PdfWriter();page=writer.add_blank_page(300,300);stream=DecodedStreamObject();stream.set_data(b' '*(MAX_PAGE_STREAM+1));page[NameObject('/Contents')]=writer._add_object(stream)
        output=BytesIO();writer.write(output)
        limited=inspect_pdf(output.getvalue());self.assertEqual(limited['pages'][0]['status'],'text_limited')
        self.assertEqual(citation_checks([candidate()],{1:limited})[0]['status'],'text_limited')

    def test_encrypted_malformed_and_page_limit_fail_before_model(self):
        for data,code in [(pdf_bytes(encrypted=True),'document_pdf_encrypted'),(b'%PDF-broken','document_pdf_invalid'),(pdf_bytes(['x']*101),'document_pdf_page_limit')]:
            with self.assertRaises(PdfInspectionError) as raised:inspect_pdf(data)
            self.assertEqual(raised.exception.code,code)
        with patch('pdf_evidence.subprocess.run',side_effect=subprocess.TimeoutExpired('parser',15)):
            with self.assertRaises(PdfInspectionError) as raised:inspect_pdf(self.pdf)
            self.assertEqual(raised.exception.code,'document_pdf_timeout')

    def test_worker_persists_checks_without_full_page_text_and_never_auto_verifies(self):
        jobs=[{'id':'property','raw_input':'[FILE_ID:synthetic] 매물 자료','attempt':1,'token':'synthetic'}];saved=[]
        def api(name,body):
            if name=='analysis_claim':return jobs.pop() if jobs else None
            saved.append(body);return True
        import json
        run(api,lambda parts:json.dumps({'document_facts':[candidate()]}),lambda tag:{'mime_type':'application/pdf','data':self.pdf},json.loads,lambda _:None,emit=lambda *a,**k:None)
        result=saved[0]['p_result']
        self.assertEqual(result['_document_checks'][0]['status'],'quote_matched')
        self.assertNotIn('verified',str(result))
        self.assertNotIn('pages',result['_document_inspections'][0])

    def test_worker_rejects_bad_pdf_without_any_provider_attempt(self):
        jobs=[{'id':'property','raw_input':'[FILE_ID:synthetic] 자료','attempt':1,'token':'synthetic'}];saved=[]
        def api(name,body):
            if name=='analysis_claim':return jobs.pop() if jobs else None
            saved.append(body);return True
        def generate(parts):raise AssertionError('Provider must not be called')
        result=run(api,generate,lambda tag:{'mime_type':'application/pdf','data':b'%PDF-broken'},lambda _:None,lambda _:None,emit=lambda *a,**k:None)
        self.assertEqual(result['failed'],1);self.assertEqual(saved[0]['p_error'],'document_pdf_invalid');self.assertFalse(saved[0]['p_retryable'])

if __name__=='__main__':unittest.main()
