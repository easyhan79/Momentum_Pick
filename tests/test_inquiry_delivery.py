import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('inquiry_delivery',ROOT/'scripts/deliver_inquiry_notifications.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Fake:
    def __init__(self,fail=False):self.fail=fail;self.completed=[];self.messages=[];self.cleaned=False
    def rpc(self,name,args):
        if name=='crm_retention_cleanup':self.cleaned=True;return 0
        if name=='crm_claim_notifications':return[{'id':'synthetic','name':'PRIVATE','phone':'PRIVATE','service_interest':'free_ad','intended_use':'PRIVATE','notification_attempts':2}]
        if name=='crm_complete_notification':self.completed.append(args)
    def send(self,message):
        self.messages.append(message)
        if self.fail:raise RuntimeError('PRIVATE')

class DeliveryTests(unittest.TestCase):
    def test_success_marks_exact_claim_and_counts_without_pii(self):
        client=Fake();result=m.deliver(client);self.assertEqual(result['sent'],1);self.assertTrue(client.cleaned);self.assertTrue(client.completed[0]['p_success']);self.assertEqual(client.completed[0]['p_attempt'],2);self.assertNotIn('PRIVATE',str(result));self.assertNotIn('PRIVATE',' '.join(client.messages))
    def test_failure_is_persisted_for_retry_not_dropped(self):
        client=Fake(True);result=m.deliver(client);self.assertEqual(result['failed'],1);self.assertFalse(client.completed[0]['p_success']);self.assertEqual(client.completed[0]['p_id'],'synthetic')
    def test_operational_test_is_explicit_and_does_not_create_customer(self):
        client=Fake();result=m.deliver(client,True);self.assertTrue(result['test_sent']);self.assertIn('실제 고객 문의나 결제가 등록된 것은 아닙니다',client.messages[0]);self.assertEqual(len(client.completed),1)
    def test_workflow_exact_script_no_checkout_and_default_test_off(self):
        workflow=(ROOT/'.github/workflows/showroom-inquiry-notifications.yml').read_text(encoding='utf8');embedded=workflow.split("          python3 - <<'PY'\n",1)[1].rsplit('          PY',1)[0];self.assertEqual('\n'.join(line[10:] for line in embedded.rstrip('\n').splitlines()),(ROOT/'scripts/deliver_inquiry_notifications.py').read_text(encoding='utf8').rstrip());self.assertIn('default: false',workflow);self.assertIn('permissions: {}',workflow);self.assertNotIn('actions/checkout',workflow)

if __name__=='__main__':unittest.main()
