import io
import json
import unittest
from unittest.mock import Mock
from ai_providers import Generation, ProviderError
from copy_rewrite_worker import run, validate_result, result_schema


class CopyRewrite(unittest.TestCase):
    def job(self, attempt=1):
        return {'id':'synthetic','token':'private-token','attempt':attempt,'fields':['summary'],
                'instruction':'간결하게','source':{'fields':[{'value':0,'unit':'kW','status':'provided'}]},'original':{'summary':'PRIVATE_ORIGINAL'}}

    def test_selected_copy_only_and_provenance_no_source_log(self):
        api=Mock(side_effect=[self.job(),True,None]);generate=Mock(return_value=Generation('{"summary":"제공 용량 0 kW. 조건 확인 필요"}','openai','synthetic-model'))
        output=io.StringIO();stats=run(api,generate,lambda text,**_:output.write(text))
        self.assertEqual(stats['done'],1);saved=api.call_args_list[1].args[1]
        self.assertEqual(saved['p_result'],{'summary':'제공 용량 0 kW. 조건 확인 필요'});self.assertEqual(saved['p_generation']['provider'],'openai')
        prompt,schema,validate=generate.call_args.args;self.assertIn('PRIVATE_ORIGINAL',prompt[0]);self.assertEqual(schema['required'],['summary']);self.assertFalse(schema['additionalProperties'])
        self.assertNotIn('PRIVATE_ORIGINAL',output.getvalue());self.assertNotIn('private-token',output.getvalue());self.assertEqual(validate('{"summary":"ok"}'),{'summary':'ok'})

    def test_invalid_extra_empty_long_or_multiline_title_rejected(self):
        for value,fields in [({'summary':'ok','concepts':[]},['summary']),({'summary':''},['summary']),({'summary':'a'*4001},['summary']),({'subtitle':'a\nb'},['subtitle']),({'summary':1},['summary'])]:
            with self.assertRaises(ValueError):validate_result(value,fields)
        for fields in [[],['summary','summary'],['concepts']]:
            with self.assertRaises(ValueError):result_schema(fields)
        self.assertEqual(validate_result({'summary':'[활용 가설] 검토 필요'},['summary']),{'summary':'활용 방향은 검토 단계입니다. 검토 필요'})

    def test_transient_is_deferred_and_exhausted_attempt_is_failed(self):
        for attempt,expected in [(1,'deferred'),(3,'failed')]:
            api=Mock(side_effect=[self.job(attempt),True,None]);generate=Mock(side_effect=ProviderError('provider_transport',True))
            stats=run(api,generate,Mock());self.assertEqual(stats[expected],1);self.assertEqual(generate.call_count,1)
            self.assertTrue(api.call_args_list[1].args[1]['p_retryable']);self.assertIsNone(api.call_args_list[1].args[1]['p_result'])

    def test_db_failure_or_lost_claim_does_not_call_provider_twice(self):
        for completion in [False,RuntimeError('database unavailable')]:
            api=Mock(side_effect=[self.job(),completion]);generate=Mock(return_value='{"summary":"candidate"}')
            with self.assertRaises(RuntimeError):run(api,generate,Mock())
            self.assertEqual(generate.call_count,1);self.assertEqual(api.call_count,2)

    def test_bad_response_is_terminal_and_limit_bounds_new_jobs(self):
        api=Mock(side_effect=[self.job(),True,self.job(),True]);generate=Mock(return_value='broken')
        stats=run(api,generate,Mock(),limit=2);self.assertEqual(stats['failed'],2);self.assertEqual(generate.call_count,2)
        self.assertEqual(api.call_args_list[1].args[1]['p_error'],'invalid_input_or_response')

    def test_default_off_without_credentials_or_network(self):
        from unittest.mock import patch
        from copy_rewrite_worker import main
        with patch.dict('os.environ',{},clear=True),patch('builtins.print') as emit:
            main();emit.assert_called_once_with('copy rewrite disabled',flush=True)


if __name__=='__main__':unittest.main()
