import base64
import unittest
from image_worker import process_image_jobs,estimate_upper_krw,MAX_INPUT_TOKENS,MAX_OUTPUT_TOKENS,prompt_for

PID='5f0c0bc1-9dc7-496c-8511-0e9ecc066f17'
PNG=b'\x89PNG\r\n\x1a\n'+b'0'*24
class Response:
    def __init__(self,data=None,status=200,content=None):self.data=data;self.status_code=status;self.content=content if content is not None else b'json'
    def json(self):return self.data
class Requests:
    def __init__(self,too_big=False,no_image=False):self.calls=[];self.completed=None;self.too_big=too_big;self.no_image=no_image
    def request(self,method,url,headers=None,json=None,**kwargs):
        path=url.split('/rest/v1/')[1];self.calls.append((method,path,json))
        if path.startswith('property_assets?'):return Response([{'property_id':PID,'storage_path':PID+'/3408c9f7-3e76-466a-b5a3-8b020c3043df.png','kind':'provided_plan'}])
        if path.startswith('property_showrooms?'):return Response([{'property_id':PID,'draft_content':{'title':'keep','concepts':[]}}])
        if path=='rpc/image_enqueue':return Response({'id':'job','state':'queued'})
        if path=='rpc/image_sync_assets':return Response(None)
        if path.startswith('property_image_jobs?state=eq.running'):return Response([])
        if path.startswith('property_image_jobs?'):return Response([{'id':'job'}])
        if path=='rpc/image_claim':return Response({'id':'job','slot':'hero','property_id':PID,'claim_token':'token'})
        if path=='property_assets':return Response([json],201)
        if path=='rpc/image_complete':self.completed=json;return Response(True)
        raise AssertionError(path)
    def get(self,url,**kwargs):return Response(content=PNG)
    def post(self,url,json=None,**kwargs):
        self.calls.append(('POST',url,json))
        if url.endswith(':countTokens'):return Response({'totalTokens':99999 if self.too_big else 1000})
        if url.endswith(':generateContent'):
            assert json['generationConfig']['candidateCount']==1
            assert json['generationConfig']['maxOutputTokens']==4096
            assert json['generationConfig']['imageConfig']['imageSize']=='1K'
            return Response({'usageMetadata':{'promptTokenCount':1000,'totalTokenCount':2200},'candidates':[{'content':{'parts':[] if self.no_image else [{'inlineData':{'data':base64.b64encode(PNG).decode()}}]}}]})
        if '/storage/v1/object/' in url:return Response({},201)
        raise AssertionError(url)

class ImageWorkerTest(unittest.TestCase):
    def test_bounded_single_generation_and_private_attachment(self):
        r=Requests();process_image_jobs('https://db',{'apikey':'SECRET'},'SECRET',r,emit=lambda *a,**k:None)
        self.assertEqual(sum(c[1].endswith(':generateContent') for c in r.calls),1)
        self.assertIsNotNone(r.completed['p_asset']);self.assertEqual(r.completed['p_usage']['reserved_krw'],500)
        asset=next(c[2] for c in r.calls if c[1]=='property_assets')
        self.assertFalse(asset['is_approved']);self.assertEqual(asset['source_type'],'ai_generated')
    def test_imported_raster_document_is_usable_without_public_reclassification(self):
        class Imported(Requests):
            def request(self,method,url,**kwargs):
                result=super().request(method,url,**kwargs)
                if '/rest/v1/property_assets?' in url:
                    for item in result.data:item.update(kind='document',source_type='owner_provided')
                return result
        r=Imported();process_image_jobs('https://db',{},'SECRET',r,emit=lambda *a,**k:None)
        self.assertIsNotNone(r.completed['p_asset']);self.assertEqual(sum(c[1].endswith(':generateContent') for c in r.calls),1)
    def test_oversized_input_stops_before_paid_generation(self):
        r=Requests(too_big=True);process_image_jobs('https://db',{},'SECRET',r,emit=lambda *a,**k:None)
        self.assertFalse(any(c[1].endswith(':generateContent') for c in r.calls));self.assertEqual(r.completed['p_error'],'input_budget_exceeded')
    def test_empty_result_fails_once_and_retains_usage(self):
        r=Requests(no_image=True);process_image_jobs('https://db',{},'SECRET',r,emit=lambda *a,**k:None)
        self.assertEqual(r.completed['p_error'],'single_image_required');self.assertEqual(r.completed['p_usage']['total_tokens'],2200)
    def test_conservative_max_request_is_below_reservation(self):
        self.assertLessEqual(estimate_upper_krw(MAX_INPUT_TOKENS,MAX_OUTPUT_TOKENS),500)
        with self.assertRaises(ValueError):prompt_for('concept-2',{'concepts':[]})

if __name__=='__main__':unittest.main()
