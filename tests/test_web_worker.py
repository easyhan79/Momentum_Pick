import json
import threading
import unittest
from unittest.mock import patch
from ai_providers import ProviderError, generate_with_fallback
from web_worker import configuration, execute_analysis, serve, LeaseLost, PRODUCTION_REF


class Db:
    def __init__(self, candidate=None):
        self.calls=[]
        self.job={'id':'private-property','run_id':'private-run','token':'secret-token','attempt':1,'raw_input':'ORIGINAL','documents':[], 'candidate':candidate}
        self.fail_save=False
        self.cancelled=False

    def rpc(self, name, body):
        self.calls.append((name,body))
        if name=='web_analysis_claim':
            job=self.job;self.job=None;return job
        if self.fail_save and name=='web_analysis_complete':
            raise RuntimeError('DB offline')
        return not self.cancelled


class WebWorkerTests(unittest.TestCase):
    def env(self):
        return {'WEB_WORKER_ENABLED':'true','WORKER_ENVIRONMENT':'production','WORKER_PROJECT_REF':PRODUCTION_REF,'SUPABASE_URL':'https://'+PRODUCTION_REF+'.supabase.co','SUPABASE_KEY':'sb_secret_synthetic','GEMINI_API_KEY':'synthetic'}

    def test_off_without_credentials_and_environment_fencing(self):
        self.assertIsNone(configuration({}))
        env=self.env();self.assertEqual(configuration(env)['environment'],'production')
        for changes in [{'WORKER_ENVIRONMENT':'staging'},{'WORKER_PROJECT_REF':'x'*20},{'SUPABASE_KEY':'anon'},{'SUPABASE_URL':'https://other.supabase.co'},{'GEMINI_API_KEY':''}]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):configuration({**env,**changes})

    def test_saved_candidate_resumes_without_model_or_document(self):
        result={'usp_summary':'saved','landing_copy':'safe','showroom_concepts':[]}
        db=Db(result)
        def forbidden(*_):raise AssertionError('unexpected external call')
        self.assertTrue(execute_analysis(db,'worker',forbidden,forbidden,forbidden,emit=lambda *a,**k:None))
        self.assertEqual(db.calls[-1][1]['p_result'],result)

    def test_generated_result_persisted_before_completion_no_telegram(self):
        result={'usp_summary':'new','landing_copy':'safe','showroom_concepts':[]}
        db=Db();parts=[]
        execute_analysis(db,'worker',lambda p:(parts.extend(p) or json.dumps(result)),json.loads,emit=lambda *a,**k:None)
        self.assertIn('ORIGINAL',parts[-1])
        self.assertEqual([b['p_phase'] for n,b in db.calls if n=='web_analysis_progress'],['generating','saving'])
        self.assertEqual(db.calls[-2][1]['p_candidate'],result)

    def test_db_failure_after_candidate_never_classified_as_provider(self):
        db=Db();db.fail_save=True;calls=[]
        with self.assertRaises(RuntimeError):
            execute_analysis(db,'worker',lambda p:(calls.append(p) or '{}'),json.loads,emit=lambda *a,**k:None)
        self.assertEqual(len(calls),1)
        self.assertEqual(len([1 for n,b in db.calls if n=='web_analysis_complete']),1)
        self.assertIn('p_candidate',db.calls[-2][1])

    def test_cancelled_lease_stops_before_provider(self):
        db=Db();db.cancelled=True
        with self.assertRaises(LeaseLost):execute_analysis(db,'worker',lambda _:self.fail('must not call'),json.loads)
        self.assertFalse(any(n=='web_analysis_complete' for n,_ in db.calls))

    def test_uncertain_provider_does_not_retry_or_failover(self):
        def failed(*_):raise ProviderError('gemini_transport',True)
        with self.assertRaises(ProviderError) as e:
            generate_with_fallback(['source'],{},json.loads,{'GEMINI_API_KEY':'synthetic','OPENAI_API_KEY':'synthetic','AI_STOP_ON_UNCERTAIN':'true'},lambda **_:self.fail('fallback forbidden'),failed,emit=lambda *a,**k:None)
        self.assertEqual(e.exception.safe_code,'outcome_unknown')
        db=Db();execute_analysis(db,'worker',failed,json.loads,emit=lambda *a,**k:None)
        self.assertEqual(db.calls[-1][1]['p_retryable'],False)

    def test_analysis_failure_does_not_block_independent_auxiliary_stage(self):
        db=Db();aux=[]
        with patch('web_worker.execute_analysis',side_effect=RuntimeError('database unavailable')):
            with self.assertRaises(RuntimeError):serve(db,'worker','test',lambda _:None,json.loads,once=True,auxiliary=lambda:aux.append('called'),emit=lambda *a,**k:None)
        self.assertEqual(aux,['called'])

    def test_service_once_reports_heartbeat_and_exits_without_notifications(self):
        db=Db();db.job=None;serve(db,'worker','test',lambda _:self.fail(),json.loads,once=True,emit=lambda *a,**k:None)
        self.assertEqual(db.calls[0][0],'web_worker_heartbeat')
        self.assertEqual(db.calls[0][1]['p_environment'],'test')
        self.assertEqual(db.calls[1][0],'web_analysis_claim')

if __name__=='__main__':unittest.main()
