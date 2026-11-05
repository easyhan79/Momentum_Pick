import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

spec=importlib.util.spec_from_file_location('analysis_worker',Path(__file__).resolve().parents[1]/'analysis_worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

class Recovery(unittest.TestCase):
    def job(self, attempt=1, raw='offline private input'):
        return {'id':'offline-id','token':'offline-token','attempt':attempt,'raw_input':raw}
    def execute(self, jobs, generate):
        completions=[]
        def api(name, body):
            if name=='analysis_claim': return jobs.pop(0) if jobs else None
            completions.append(body);return True
        output=io.StringIO();notices=[]
        stats=worker.run(api,generate,lambda _: 'offline-file',json.loads,notices.append,lambda s,**_:output.write(s+'\n'))
        return stats,completions,notices,output.getvalue()
    def test_valid_result_only_is_completed(self):
        result={'usp_summary':'offline'}
        stats,c,_,log=self.execute([self.job()],lambda _:json.dumps(result))
        self.assertEqual(stats['analyzed'],1);self.assertEqual(c[0]['p_result'],result)
        self.assertNotIn('offline private input',log);self.assertNotIn('offline-token',log)
    def test_provider_busy_is_deferred_once_without_sleep_loop(self):
        class ServerError(Exception):code=503
        generate=Mock(side_effect=ServerError('secret-provider-detail'))
        stats,c,n,log=self.execute([self.job()],generate)
        self.assertEqual(generate.call_count,1);self.assertEqual(stats['deferred'],1)
        self.assertEqual(c[0]['p_error'],'provider_503');self.assertTrue(c[0]['p_retryable'])
        self.assertNotIn('secret-provider-detail',log+''.join(n))
    def test_transport_and_auth_classification(self):
        RemoteProtocolError=type('RemoteProtocolError',(Exception,),{})
        self.assertEqual(worker.failure(RemoteProtocolError()),('provider_transport',True))
        for code in (400,401,403,404):
            self.assertEqual(worker.failure(type('E',(Exception,),{'code':code})()),('provider_'+str(code),False))
    def test_exhausted_attempt_is_terminal_notice(self):
        E=type('E',(Exception,),{'code':503})
        stats,c,n,_=self.execute([self.job(5)],Mock(side_effect=E()))
        self.assertEqual(stats['failed'],1);self.assertIn('중단',n[0]);self.assertIsNone(c[0]['p_result'])
    def test_invalid_json_never_becomes_success(self):
        stats,c,_,_=self.execute([self.job()],lambda _:'broken')
        self.assertEqual(stats['failed'],1);self.assertEqual(c[0]['p_error'],'invalid_input_or_response')
    def test_partial_failure_does_not_block_next_item(self):
        E=type('E',(Exception,),{'code':503})
        stats,c,_,_=self.execute([self.job(),self.job()],Mock(side_effect=[E(),'{}']))
        self.assertEqual(stats,{'analyzed':1,'deferred':1,'failed':0});self.assertEqual(len(c),2)
    def test_file_and_text_are_both_passed_without_tag(self):
        gen=Mock(return_value='{}');self.execute([self.job(raw='[FILE_ID:offline-file-id] original text')],gen)
        parts=gen.call_args.args[0];self.assertEqual(parts[0],'offline-file');self.assertIn('original text',parts[1]);self.assertNotIn('FILE_ID',parts[1])
    def test_all_album_files_are_sent_once(self):
        gen=Mock(return_value='{}');self.execute([self.job(raw='[FILE_ID:first] [FILE_ID:second] [FILE_ID:first] caption')],gen)
        self.assertEqual(gen.call_args.args[0][:-1],['offline-file','offline-file'])
    def test_stale_completion_raises_and_does_not_notify_success(self):
        api=Mock(side_effect=[self.job(),False]);notify=Mock()
        with self.assertRaisesRegex(RuntimeError,'claim_lost'):
            worker.run(api,lambda _:'{}',Mock(),json.loads,notify,Mock())
        notify.assert_not_called()
    def test_database_failure_not_reclassified_as_provider_failure(self):
        api=Mock(side_effect=[self.job(),RuntimeError('db offline')])
        with self.assertRaisesRegex(RuntimeError,'db offline'):
            worker.run(api,lambda _:'{}',Mock(),json.loads,Mock(),Mock())
        self.assertEqual(api.call_count,2)
    def test_provider_provenance_is_attached_by_application(self):
        from ai_providers import Generation
        stats,c,_,_=self.execute([self.job()],lambda _:Generation('{"summary":"synthetic"}','openai','gpt-6.1-terra'))
        self.assertEqual(stats['analyzed'],1);self.assertEqual(c[0]['p_result']['_generation']['provider'],'openai')
        self.assertEqual(c[0]['p_result']['_generation']['model'],'gpt-6.1-terra')

if __name__=='__main__':unittest.main()
