import unittest
from sales_analysis import validate_v2_candidates

def fixture():
    source={'kind':'input_text','inputVersionId':'p:1'}
    def quantity(key,value,unit):return {'key':key,'rawText':f'{value} {unit}','value':value,'unit':unit,'normalizedSqm':999,'status':'provided','sourceRefs':[source]}
    return {'_document_inspections':[{'source_index':1,'page_count':2}],'listing_bundle':{'schemaVersion':2,'parcels':[{'id':'p1','addressText':'101','measurements':[quantity('land_area',1200,'sqm')],'sourceRefs':[source]},{'id':'p2','addressText':'102','measurements':[quantity('land_area',100,'pyeong')],'sourceRefs':[source]}],
       'buildings':[{'id':'b1','parcelIds':['p1'],'measurements':[quantity('building_area',300,'sqm'),quantity('gross_floor_area',600,'sqm')],'sourceRefs':[source]}],
       'saleScope':'bundle','priceClaims':[{'scope':'listing','targetIds':[],'rawText':'15억','amountWon':1500000000,'sourceRefs':[source]}],
       'conflicts':[{'fieldPath':'buildings.b1.gross_floor_area','candidates':[{'value':600,'sourceRefs':[source]},{'value':580,'sourceRefs':[{'kind':'pdf','assetId':'doc','page':1}]}]}]},
      'sales_strategy':{'positioning':'일괄 매각','buyerSegments':[{'label':'실사용','rationale':'활용 검토','sourceRefs':[source]}],
       'sellingPoints':[{'fact':'두 필지','buyerBenefit':'함께 검토','sourceRefs':[source]}],
       'useScenarios':[{'description':'거점 검토','conditions':['허용 용도 확인'],'unknowns':['진입 조건'],'sourceRefs':[source]}],
       'headlineVariants':['두 필지 일괄 매각'],'materialConstraints':[{'description':'진입 미확인','relatedClaim':'거점 검토'}],'callToAction':'자료 요청'}}

class SalesAnalysisTests(unittest.TestCase):
    def test_distinct_sources_quantities_and_price_scope_are_preserved(self):
        result=validate_v2_candidates(fixture(),'p:1',[{'assetId':'doc'}],[]);bundle=result['listing_bundle']
        self.assertEqual(bundle['parcels'][1]['measurements'][0]['normalizedSqm'],330.5785)
        self.assertEqual(bundle['priceClaims'][0]['targetIds'],[]);self.assertEqual(len(bundle['conflicts'][0]['candidates']),2)
        self.assertNotIn('assetId',bundle['parcels'][0]['sourceRefs'][0])
    def test_rejects_cross_property_source_and_unverified_elevation(self):
        item=fixture();item['listing_bundle']['conflicts'][0]['candidates'][1]['sourceRefs'][0]['assetId']='other'
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
        item=fixture();item['listing_bundle']['parcels'][0]['measurements'][0]['status']='verified'
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
        item=fixture();item['listing_bundle']['conflicts'][0]['candidates'][1]['sourceRefs'][0]['page']=3
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
    def test_does_not_assume_links_or_split_listing_price(self):
        item=fixture();item['listing_bundle']['buildings'][0]['parcelIds']=[]
        self.assertEqual(validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])['listing_bundle']['buildings'][0]['parcelIds'],[])
        item=fixture();item['listing_bundle']['priceClaims'][0]['targetIds']=['p1']
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
    def test_listing_price_normalizes_only_complete_unique_targets(self):
        item=fixture();item['listing_bundle']['priceClaims'][0]['targetIds']=['p1','p2','b1']
        result=validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
        self.assertEqual(result['listing_bundle']['priceClaims'][0]['targetIds'],[])
        for targets in (['p1','b1'],['p1','p2','b1','b1']):
            item=fixture();item['listing_bundle']['priceClaims'][0]['targetIds']=targets
            with self.subTest(targets=targets),self.assertRaises(ValueError):
                validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
    def test_rejects_unverified_operational_assurances(self):
        for claim in ('즉각적인 공간 기획과 직영 운영이 가능합니다', '명도 협의나 권리금 분쟁 없이 입주할 수 있습니다'):
            item=fixture();item['sales_strategy']['sellingPoints'][0]['buyerBenefit']=claim
            with self.subTest(claim=claim),self.assertRaisesRegex(ValueError,'v2_unverified_claim'):
                validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
        item=fixture();item['sales_strategy']['sellingPoints'][0]['buyerBenefit']='입주 가능 여부는 계약과 인허가 확인 후 검토할 수 있습니다.'
        validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
    def test_rejects_over_limit_and_unknown_parcel_reference(self):
        item=fixture();item['listing_bundle']['buildings'][0]['parcelIds']=['missing']
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
        item=fixture();item['listing_bundle']['parcels'][0]['measurements']*=61
        with self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])
    def test_only_schema_version_two_is_accepted(self):
        for version in (1,3):
            item=fixture();item['listing_bundle']['schemaVersion']=version
            with self.subTest(version=version),self.assertRaises(ValueError):validate_v2_candidates(item,'p:1',[{'assetId':'doc'}],[])

if __name__=='__main__':unittest.main()
