import base64
import unittest
from image_worker import process_image_jobs,estimate_upper_krw,MAX_INPUT_TOKENS,MAX_OUTPUT_TOKENS,prompt_for,zoning_for

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
            assert json['generationConfig']['maxOutputTokens']==2250
            assert json['generationConfig']['imageConfig']['imageSize']=='1K'
            return Response({'usageMetadata':{'promptTokenCount':1000,'totalTokenCount':2200},'candidates':[{'content':{'parts':[] if self.no_image else [{'inlineData':{'data':base64.b64encode(PNG).decode()}}]}}]})
        if '/storage/v1/object/' in url:return Response({},201)
        raise AssertionError(url)

class ImageWorkerTest(unittest.TestCase):
    def test_explicit_photo_mode_uses_selected_photo_and_labels_future_image(self):
        class Photo(Requests):
            def request(self,method,url,**kwargs):
                result=super().request(method,url,**kwargs)
                if '/rest/v1/property_showrooms?' in url:
                    result.data[0]['draft_content']['imageSettings']={'mode':'photo','sourceAssetId':'3408c9f7-3e76-466a-b5a3-8b020c3043df','rightsApproved':True}
                if '/rest/v1/property_assets?' in url:
                    assert 'id=eq.3408c9f7-3e76-466a-b5a3-8b020c3043df' in url
                    assert 'kind=eq.photo' in url
                    result.data[0].update(kind='photo',source_type='owner_provided')
                return result
        r=Photo();process_image_jobs('https://db',{},'synthetic',r,emit=lambda *a,**k:None)
        self.assertIsNotNone(r.completed['p_asset']);self.assertEqual(r.completed['p_usage']['image_type'],'photo')
        asset=next(c[2] for c in r.calls if c[1]=='property_assets')
        self.assertIn('현장 사진 기반 AI 변환 이미지',asset['caption']);self.assertIn('실제 현황 아님',asset['caption'])
    def test_explicit_reference_without_usage_rights_stops_before_provider(self):
        class NoRights(Requests):
            def request(self,method,url,**kwargs):
                result=super().request(method,url,**kwargs)
                if '/rest/v1/property_showrooms?' in url:
                    result.data[0]['draft_content']['imageSettings']={'mode':'plan','sourceAssetId':'3408c9f7-3e76-466a-b5a3-8b020c3043df','rightsApproved':False}
                return result
        r=NoRights();process_image_jobs('https://db',{},'synthetic',r,emit=lambda *a,**k:None)
        self.assertEqual(r.completed['p_error'],'image_source_required')
        self.assertFalse(any(c[1].endswith(':generateContent') or c[1].endswith(':countTokens') for c in r.calls))
    def test_new_profile_prompt_excludes_fields_without_usage_rights(self):
        draft={'propertyProfile':{'fields':[{'label':'전력','value':300,'useApproved':True,'status':'provided'},{'label':'PRIVATE_NO_USE','value':'SECRET_VALUE','useApproved':False,'status':'provided'}]}}
        prompt=prompt_for('hero',draft)
        self.assertIn('300',prompt);self.assertNotIn('PRIVATE_NO_USE',prompt);self.assertNotIn('SECRET_VALUE',prompt)
    def test_bounded_single_generation_and_private_attachment(self):
        r=Requests();process_image_jobs('https://db',{'apikey':'SECRET'},'SECRET',r,emit=lambda *a,**k:None)
        self.assertEqual(sum(c[1].endswith(':generateContent') for c in r.calls),1)
        self.assertIsNotNone(r.completed['p_asset']);self.assertEqual(r.completed['p_usage']['reserved_krw'],250)
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
    def test_text_only_analysis_generates_without_source_images(self):
        class NoSources(Requests):
            def request(self,method,url,**kwargs):
                if '/rest/v1/property_assets?' in url:return Response([])
                return super().request(method,url,**kwargs)
            def get(self,*args,**kwargs):raise AssertionError('No source download expected')
        r=NoSources();process_image_jobs('https://db',{},'SECRET',r,emit=lambda *a,**k:None)
        self.assertIsNotNone(r.completed['p_asset'])
        paid=next(c[2] for c in r.calls if c[1].endswith(':generateContent'))
        self.assertTrue(all('inlineData' not in p for p in paid['contents'][0]['parts']))
    def test_zones_and_analysis_are_in_spatial_prompt_and_usage(self):
        draft={'summary':'analysis detail','concepts':[{'id':'concept-1','zones':[{'id':'z1','title':'Loading area'},{'id':'z2','title':'Storage'}]}]}
        prompt=prompt_for('concept-1',draft)
        self.assertIn('analysis detail',prompt);self.assertIn('Loading area',prompt)
        self.assertIn('overhead/isometric',prompt);self.assertIn('27',prompt)
        self.assertEqual(zoning_for(draft,'concept-1'),[{'zoneId':'z1','x':27,'y':28},{'zoneId':'z2','x':73,'y':28}])
    def test_conservative_max_request_is_below_reservation(self):
        self.assertLessEqual(estimate_upper_krw(MAX_INPUT_TOKENS,MAX_OUTPUT_TOKENS),250)
        # Measured production images used up to 1,864 output tokens; keep a margin above that.
        self.assertGreaterEqual(MAX_OUTPUT_TOKENS,2200)
        with self.assertRaises(ValueError):prompt_for('concept-2',{'concepts':[]})

if __name__=='__main__':unittest.main()

class PurposeImagePrompt(unittest.TestCase):
    def test_purpose_requirements_are_questions_and_do_not_add_paid_calls(self):
        from image_worker import prompt_for
        draft={'category':'industrial','concepts':[{'id':'concept-1','conceptName':'합성 제조','headline':'검토','rationale':'전력 확인 필요','zones':[], 'purposeContext':[{'id':'factory-manufacturing','requiredKeys':['power_capacity'],'constraints':'수전 확인 필요'}]}]}
        prompt=prompt_for('concept-1',draft)
        self.assertIn('purpose_requirements',prompt);self.assertIn('power_capacity',prompt)
        self.assertIn('not verified facilities',prompt);self.assertIn('missing operating conditions hypothetical',prompt)


class BriefPromptTest(unittest.TestCase):
    def test_confirmed_brief_points_and_target_drive_the_image_prompt(self):
        from image_worker import prompt_for
        draft = {'automation': {'imageStyle': 'photorealistic'}, 'concepts': [{'id': 'concept-1', 'conceptName': '카페'}],
                 'salesStrategy': {'positioning': '상가', 'sellingPoints': [{'fact': '분석 원래 장점', 'buyerBenefit': 'x'}]},
                 'brief': {'version': 1, 'target': '카페 창업자', 'tone': 'friendly', 'avoid': '', 'points': [{'fact': '테라스 20평', 'buyerBenefit': '야외 좌석', 'source': ''}]}}
        prompt = prompt_for('hero', draft)
        self.assertIn('테라스 20평', prompt)
        self.assertIn('카페 창업자', prompt)
        self.assertNotIn('분석 원래 장점', prompt)
        del draft['brief']
        self.assertIn('분석 원래 장점', prompt_for('hero', draft))
