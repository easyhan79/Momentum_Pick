import unittest
from customer_copy import customer_prose,prepare_customer_copy
from analysis_worker import draft,UniversalMarketingPackage


class CustomerCopy(unittest.TestCase):
    def test_internal_labels_keep_provenance_and_conditions_in_prose(self):
        raw='[사실 조건] 토지 100㎡입니다. [제공 주장] 장기 임대 중입니다. [활용 가설] 계약 승계 가능 여부는 확인이 필요합니다.'
        prose=customer_prose(raw)
        self.assertEqual(prose,'제공자료에 따르면 토지 100㎡입니다. 제공자 설명에 따르면 장기 임대 중입니다. 활용 방향은 검토 단계입니다. 계약 승계 가능 여부는 확인이 필요합니다.')
        self.assertNotIn('8년',prose)
        self.assertEqual(customer_prose(prose),prose)

    def test_sources_quotes_and_review_status_are_never_changed(self):
        quote='[제공 주장] 임차기간은 8년이며 승계 조건은 별도 확인'
        package={'usp_summary':quote,'document_facts':[{'quote':quote}],'copy_review':[{'category':'provided_claim','statement':quote,'check':'계약서 대조'}]}
        result=prepare_customer_copy(package)
        self.assertEqual(package['usp_summary'],quote)
        self.assertEqual(result['_copy_original']['usp_summary'],quote)
        self.assertEqual(result['document_facts'],package['document_facts'])
        self.assertEqual(result['copy_review'],package['copy_review'])
        self.assertEqual(prepare_customer_copy(result),result)
        self.assertNotIn('verified',str(result))

    def test_other_brackets_card_markers_and_qualifications_are_preserved(self):
        raw='[카드 1]\n[제공주장] 0원 [FILE_ID:synthetic] · [추가 확인] 승계 여부 미확인'
        result=customer_prose(raw)
        self.assertIn('[카드 1]',result);self.assertIn('0원',result);self.assertIn('[추가 확인]',result)
        self.assertIn('[FILE_ID:synthetic]',result);self.assertIn('승계 여부 미확인',result)

    def test_new_legacy_draft_has_natural_copy_without_private_review(self):
        ai={'usp_summary':'[제공 주장] 장기 임대 중입니다.','landing_copy':'[사실 조건] 합성 물류센터','copy_review':[{'statement':'PRIVATE'}],'_copy_original':{'usp_summary':'PRIVATE'}}
        result=draft({'id':'synthetic','ai_contents':ai})
        self.assertEqual(result['summary'],'제공자 설명에 따르면 장기 임대 중입니다.')
        self.assertNotIn('PRIVATE',str(result));self.assertNotIn('8년',result['summary'])
        self.assertIn('확인 필요',result['unknowns'][0])

    def test_model_review_categories_cannot_claim_verification(self):
        schema=UniversalMarketingPackage.model_json_schema()
        categories=schema['$defs']['CopyReviewItem']['properties']['category']['enum']
        self.assertNotIn('verified',categories)
        self.assertIn('usage_hypothesis',categories)
