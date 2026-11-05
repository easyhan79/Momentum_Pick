import json
import unittest
from document_sources import load_private_document
from analysis_worker import run
from tests.pdf_fixtures import pdf_bytes

PROPERTY='10000000-0000-4000-8000-000000000001'
ASSET='20000000-0000-4000-8000-000000000002'
class Response:
    status_code=200
    def __init__(self,rows=None,chunks=None):self.rows=rows;self.chunks=chunks or [b'%PDF-1.7\nsynthetic']
    def json(self):return self.rows
    def iter_content(self,size):return iter(self.chunks)
    def __enter__(self):return self
    def __exit__(self,*args):return False
class Requests:
    def __init__(self,path=None,chunks=None):self.path=path or f'{PROPERTY}/{ASSET}.pdf';self.chunks=chunks
    def get(self,url,**kwargs):
        if '/rest/v1/' in url:
            assert f'property_id=eq.{PROPERTY}' in url
            assert f'id=eq.{ASSET}' in url
            return Response(rows=[{'storage_path':self.path,'kind':'document','source_type':'owner_provided'}])
        assert kwargs['allow_redirects'] is False
        return Response(chunks=self.chunks)

class DocumentSourcesTest(unittest.TestCase):
    def test_scoped_pdf_bytes_are_passed_without_public_links(self):
        result=load_private_document('https://db',{},PROPERTY,ASSET,Requests())
        self.assertEqual(result['mime_type'],'application/pdf');self.assertTrue(result['data'].startswith(b'%PDF-'))
    def test_invalid_paths_non_pdf_and_size_are_rejected(self):
        for req in [Requests(path='../private.pdf'),Requests(chunks=[b'<html>']),Requests(chunks=[b'%PDF-'+b'x'*(8*1024*1024)])]:
            with self.assertRaises(ValueError):load_private_document('https://db',{},PROPERTY,ASSET,req)
        with self.assertRaises(ValueError):load_private_document('https://db',{},PROPERTY,'bad',Requests())
    def test_worker_links_source_indices_to_the_property_and_stores_private_provenance(self):
        jobs=[{'id':PROPERTY,'raw_input':f'[DOCUMENT_ID:{ASSET}] 제공자료','attempt':1,'token':'synthetic'}];saved=[]
        def api(name,body):
            if name=='analysis_claim':return jobs.pop() if jobs else None
            saved.append(body);return True
        received=[]
        def document(asset,prop):received.append((asset,prop));return {'mime_type':'application/pdf','data':pdf_bytes()}
        stats=run(api,lambda parts:json.dumps({'document_facts':[]}),lambda tag:None,json.loads,lambda text:None,emit=lambda *a,**k:None,document_attachment=document)
        self.assertEqual(stats['analyzed'],1);self.assertEqual(received,[(ASSET,PROPERTY)])
        self.assertEqual(saved[0]['p_result']['_document_sources'],[{'source_index':1,'asset_id':ASSET,'property_id':PROPERTY}])

if __name__=='__main__':unittest.main()
