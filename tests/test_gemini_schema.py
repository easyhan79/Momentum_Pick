import importlib.util
import unittest
from unittest.mock import patch


try:
    GENAI_AVAILABLE = importlib.util.find_spec('google.genai') is not None
except ModuleNotFoundError:
    GENAI_AVAILABLE = False


@unittest.skipUnless(GENAI_AVAILABLE, 'google-genai SDK is not installed')
class GeminiSchemaTests(unittest.TestCase):
    def test_v2_schema_serializes_before_network(self):
        from google import genai
        from google.genai import types
        from analysis_worker import UniversalMarketingPackageV2,gemini_compatible_schema
        import json
        client=genai.Client(api_key='synthetic-key')
        def inspect_request(*args,**kwargs):
            self.assertNotIn('additional_properties',json.dumps(args[2]))
            self.assertNotIn('additionalProperties',json.dumps(args[2]))
            raise RuntimeError('NETWORK_REACHED')
        with patch.object(client._api_client,'request',side_effect=inspect_request):
            with self.assertRaisesRegex(RuntimeError,'NETWORK_REACHED'):
                client.models.generate_content(model='gemini-3.8-flash',contents=['synthetic'],config=types.GenerateContentConfig(response_mime_type='application/json',response_schema=gemini_compatible_schema(UniversalMarketingPackageV2),temperature=0.7))
