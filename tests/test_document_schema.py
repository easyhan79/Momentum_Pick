import unittest
from pydantic import ValidationError
from analysis_worker import DocumentFact, UniversalMarketingPackage

class DocumentSchemaTest(unittest.TestCase):
    def test_document_fact_bounds_and_unknown_page(self):
        data=dict(key='land_area',label='토지면적',value='100',unit='㎡',source_index=1,page=0,quote='토지면적 100㎡',missing=False)
        self.assertEqual(DocumentFact(**data).page,0)
        for patch in [dict(page=-1),dict(source_index=13),dict(key='<script>'),dict(quote='x'*301)]:
            with self.assertRaises(ValidationError):DocumentFact(**{**data,**patch})
    def test_schema_includes_optional_bounded_extraction_without_requiring_old_records_to_have_it(self):
        field=UniversalMarketingPackage.model_fields['document_facts']
        self.assertFalse(field.is_required())
        schema=UniversalMarketingPackage.model_json_schema()
        self.assertEqual(schema['properties']['document_facts']['maxItems'],20)

if __name__=='__main__':unittest.main()
