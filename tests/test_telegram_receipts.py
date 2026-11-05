import unittest
from unittest.mock import Mock
from telegram_receipts import drain
class Receipts(unittest.TestCase):
 def test_failure_is_persisted_without_leaking_private_values(self):
  api=Mock(side_effect=[{'property_id':'prop','chat_id':'PRIVATE','token':'SECRET'},True,None]);emit=Mock();send=Mock(side_effect=RuntimeError('PRIVATE'))
  self.assertEqual(drain(api,send,emit),{'sent':0,'deferred':1});self.assertFalse(api.call_args_list[1].args[1]['p_success']);self.assertNotIn('PRIVATE',str(emit.call_args_list));self.assertNotIn('SECRET',str(emit.call_args_list))
 def test_stale_lease_does_not_claim_delivery(self):
  api=Mock(side_effect=[{'property_id':'prop','chat_id':'123','token':'lease'},False]);
  with self.assertRaisesRegex(RuntimeError,'receipt_claim_lost'):drain(api,Mock(return_value=True),Mock())
