import json
import unittest
from scripts.diagnose_telegram_intake import diagnose,write_report,test_message_state,BASE


class IntakeDiagnosticsTest(unittest.TestCase):
    def test_safe_report_identifies_wrong_webhook_auth_without_exposing_bindings(self):
        calls=[]
        def reader(url,headers=None,method='GET'):
            calls.append((url,method))
            if url.endswith('/getMe'):return 200,{'ok':True,'result':{'username':'PRIVATE_BOT'}}
            if url.endswith('/getWebhookInfo'):return 200,{'ok':True,'result':{'url':BASE+'/functions/v1/clever-endpoint','pending_update_count':3,'last_error_message':'Wrong response from the webhook: 401 Unauthorized'}}
            if method=='HEAD':return 200,{}
            return 200,dict(telegram_configured=False,dispatch_configured=True,webhook_secret_configured=True)
        env=dict(TELEGRAM_TOKEN='123:PRIVATE_TOKEN',SUPABASE_URL=BASE,SUPABASE_KEY='PRIVATE_SERVER_KEY')
        result=diagnose(env,reader)
        self.assertEqual(result['webhook_last_error'],'HTTP_401');self.assertTrue(result['pending_updates'])
        self.assertEqual(result['intake'],'EDGE_OK');self.assertFalse(result['telegram_configured'])
        self.assertNotIn('PRIVATE',json.dumps(result));self.assertNotIn(BASE,json.dumps(result))
        self.assertTrue(all(method in ('GET','HEAD') and not any(name in url for name in ['sendMessage','setWebhook','getUpdates']) for url,method in calls))
    def test_missing_bindings_make_no_requests(self):
        def reader(*args,**kwargs):raise AssertionError('unexpected request')
        result=diagnose({},reader)
        self.assertEqual(result['bot'],'BOT_UNCONFIGURED');self.assertEqual(result['database'],'DB_UNCHECKED')
    def test_error_bodies_and_unexpected_target_are_not_published(self):
        def reader(url,headers=None,method='GET'):
            if url.endswith('/getMe'):return 401,{'message':'PRIVATE_TOKEN'}
            if url.endswith('/getWebhookInfo'):return 200,{'ok':True,'result':{'url':'https://private.invalid/token','last_error_message':'PRIVATE_ERROR'}}
            return 403,{'message':'PRIVATE_SERVER_ERROR'}
        result=diagnose(dict(TELEGRAM_TOKEN='123:PRIVATE_TOKEN',SUPABASE_URL=BASE,SUPABASE_KEY='PRIVATE'),reader)
        self.assertEqual(result['webhook'],'HOOK_TARGET_OTHER');self.assertEqual(result['webhook_last_error'],'REPORTED')
        self.assertNotIn('PRIVATE',json.dumps(result))
    def test_function_target_is_classified_without_publishing_query_or_other_hosts(self):
        def reader(url,headers=None,method='GET'):
            if url.endswith('/getMe'):return 200,{'ok':True}
            if url.endswith('/getWebhookInfo'):return 200,{'ok':True,'result':{'url':BASE+'/functions/v1/telegram-webhook?secret=PRIVATE','pending_update_count':0}}
            if method=='HEAD':return 200,{}
            return 200,{'unexpected':'PRIVATE'}
        result=diagnose(dict(TELEGRAM_TOKEN='123:PRIVATE_TOKEN',SUPABASE_URL=BASE,SUPABASE_KEY='sb_secret_PRIVATE'),reader)
        self.assertEqual(result['webhook_function'],'telegram-webhook');self.assertTrue(result['webhook_query_present'])
        self.assertEqual(result['intake'],'EDGE_UNKNOWN_RESPONSE');self.assertNotIn('telegram_configured',result)
        self.assertNotIn('PRIVATE',json.dumps(result));self.assertNotIn('secret=',json.dumps(result))
    def test_recent_test_lookup_reports_only_states_not_property_identity_or_content(self):
        identifier='10000000-0000-4000-8000-000000000001'
        def reader(url,headers=None,method='GET'):
            if '/properties?' in url:return 200,[{'id':identifier,'status':'pending','created_at':'PRIVATE_TIME'}]
            if '/property_analysis_jobs?' in url:return 200,[{'state':'waiting','attempts':0}]
            if '/telegram_intake_batches?' in url:return 200,[{'receipt_state':'failed','dispatch_code':'http_401'}]
            raise AssertionError('unexpected request')
        result=test_message_state(reader,{'apikey':'PRIVATE'})
        self.assertEqual(result['test_record'],'TEST_FOUND');self.assertEqual(result['analysis_state'],'waiting')
        self.assertEqual(result['dispatch_result'],'http_401')
        self.assertNotIn(identifier,json.dumps(result));self.assertNotIn('PRIVATE',json.dumps(result))


if __name__=='__main__':unittest.main()
