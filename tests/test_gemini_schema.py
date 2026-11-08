import importlib.util
import unittest
from unittest.mock import patch


try:
    GENAI_AVAILABLE = importlib.util.find_spec('google.genai') is not None
except ModuleNotFoundError:
    GENAI_AVAILABLE = False


@unittest.skipUnless(GENAI_AVAILABLE, 'google-genai SDK is not installed')
class GeminiSchemaTests(unittest.TestCase):
    def test_synthetic_observer_receives_response_before_schema_rejection(self):
        from analysis_worker import generation_services
        from ai_providers import ProviderError
        from unittest.mock import MagicMock
        from types import SimpleNamespace
        import requests
        client=MagicMock()
        client.__enter__.return_value.models.generate_content.return_value=SimpleNamespace(prompt_feedback=None,candidates=[],text='{"invalid":true}')
        observed=[]
        with patch('google.genai.Client',return_value=client):
            generate,_,_=generation_services({'GEMINI_API_KEY':'synthetic-key','AI_PROVIDER_ORDER':'gemini'},requests,use_v2=True,observe_output=observed.append)
            with self.assertRaises(ProviderError):generate(['synthetic'])
        self.assertEqual(observed,['{"invalid":true}'])

    def test_v2_schema_serializes_before_network(self):
        from analysis_worker import generation_services
        import json
        import requests
        from ai_providers import ProviderError
        captured=[]
        def inspect_request(*args,**kwargs):
            captured.append(args[2])
            raise RuntimeError('NETWORK_REACHED')
        from google.genai import _api_client
        with patch.object(_api_client.BaseApiClient,'request',side_effect=inspect_request):
            generate,_,_=generation_services({'GEMINI_API_KEY':'synthetic-key','AI_PROVIDER_ORDER':'gemini'},requests,use_v2=True)
            with self.assertRaises(ProviderError):generate(['synthetic'])
        self.assertEqual(len(captured),1)
        config=captured[0]['generationConfig']
        self.assertNotIn('responseSchema',config)
        self.assertNotIn('responseJsonSchema',config)
        self.assertIn('listing_bundle',json.dumps(captured[0]))
