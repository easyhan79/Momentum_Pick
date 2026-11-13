import datetime
import unittest
from location_data import CATEGORIES, LocationError, build_report, pnu, prompt_context, refresh_next, sections_for


class Response:
    def __init__(self, status, data=None, text=''):
        self.status_code, self._data, self.text = status, data, text

    def json(self):
        if isinstance(self._data, Exception):
            raise self._data
        return self._data


ADDRESS_DOC = {'address_name': '서울 강남구 역삼동 823', 'x': '127.0360', 'y': '37.5000',
               'address': {'region_1depth_name': '서울', 'region_2depth_name': '강남구', 'region_3depth_name': '역삼동',
                           'b_code': '1168010100', 'main_address_no': '823', 'sub_address_no': '', 'mountain_yn': 'N'},
               'road_address': {'address_name': '서울 강남구 테헤란로 152', 'building_name': '시험빌딩'}}


class Kakao:
    """Synthetic Kakao Local responses; records each request."""
    def __init__(self, address_docs=(ADDRESS_DOC,), category_status=200):
        self.calls, self.address_docs, self.category_status = [], list(address_docs), category_status

    def get(self, url, params=None, headers=None, timeout=None, allow_redirects=None):
        self.calls.append((url, dict(params or {}), dict(headers or {})))
        if url.endswith('/search/address.json'):
            return Response(200, {'documents': self.address_docs, 'meta': {'total_count': len(self.address_docs)}})
        if self.category_status != 200:
            return Response(self.category_status, {})
        radius = params['radius']
        docs = [{'place_name': params['category_group_code'] + ' 가까운곳', 'distance': '120'},
                {'place_name': params['category_group_code'] + ' 먼곳', 'distance': str(radius + 50)},
                {'place_name': '거리없음', 'distance': ''}]
        return Response(200, {'documents': docs, 'meta': {'total_count': 7}})


NOW = datetime.datetime(2026, 11, 14, 3, 0, 0, 123, tzinfo=datetime.timezone.utc)


class LocationReportTests(unittest.TestCase):
    def test_report_has_source_date_radius_and_lot_numbers(self):
        kakao = Kakao()
        state, report = build_report(kakao, 'synthetic-key', '서울 강남구 테헤란로 152', NOW)
        self.assertEqual(state, 'done')
        self.assertEqual(report['source']['name'], '카카오 로컬')
        self.assertEqual(report['fetchedAt'], '2026-11-14T03:00:00Z')
        self.assertEqual(report['coordinate'], {'lat': 37.5, 'lng': 127.036})
        self.assertEqual(report['region']['bCode'], '1168010100')
        self.assertEqual(report['region']['mainNo'], '823')
        self.assertEqual(len(report['nearby']), len(CATEGORIES))
        subway = report['nearby'][0]
        self.assertEqual((subway['label'], subway['radius'], subway['count']), ('지하철역', 1000, 7))
        # Places outside the radius or without a distance are not listed.
        self.assertEqual(subway['nearest'], [{'name': 'SW8 가까운곳', 'distance': 120}])
        # Key goes in the KakaoAK header only, never in the query string.
        for url, params, headers in kakao.calls:
            self.assertEqual(headers, {'Authorization': 'KakaoAK synthetic-key'})
            self.assertNotIn('synthetic-key', repr(params) + url)
        self.assertEqual(len(kakao.calls), 1 + len(CATEGORIES))

    def test_unknown_or_foreign_address_is_not_found(self):
        self.assertEqual(build_report(Kakao(address_docs=()), 'k', '없는 주소', NOW), ('not_found', {}))
        abroad = {**ADDRESS_DOC, 'x': '2.35', 'y': '48.85'}
        self.assertEqual(build_report(Kakao(address_docs=(abroad,)), 'k', '파리', NOW), ('not_found', {}))

    def test_provider_errors_are_classified_without_messages(self):
        for status, code, retryable in [(401, 'kakao_unauthorized', False), (429, 'kakao_429', True), (500, 'kakao_500', True), (400, 'kakao_400', False)]:
            with self.subTest(status=status), self.assertRaises(LocationError) as caught:
                build_report(Kakao(category_status=status), 'k', '주소', NOW)
            self.assertEqual((caught.exception.code, caught.exception.retryable), (code, retryable))

    def test_refresh_saves_result_or_failure_for_the_fetched_address(self):
        class Db:
            def __init__(self, job):
                self.job, self.saved = job, []
            def rpc(self, name, body):
                if name == 'location_report_next':
                    job, self.job = self.job, None
                    return job
                self.saved.append(body)
                return True
        quiet = lambda *a, **k: None
        db = Db({'property_id': 'p1', 'address': '서울 강남구 테헤란로 152'})
        self.assertTrue(refresh_next(db, 'k', Kakao(), quiet, NOW))
        self.assertEqual((db.saved[0]['p_state'], db.saved[0]['p_address'], db.saved[0]['p_error']), ('done', '서울 강남구 테헤란로 152', ''))
        self.assertFalse(refresh_next(db, 'k', Kakao(), quiet, NOW))
        failing = Db({'property_id': 'p1', 'address': 'a'})
        refresh_next(failing, 'k', Kakao(category_status=401), quiet, NOW)
        self.assertEqual((failing.saved[0]['p_state'], failing.saved[0]['p_error'], failing.saved[0]['p_report']), ('failed', 'kakao_unauthorized', {}))

    def test_prompt_context_lists_counts_with_source_and_date(self):
        _, report = build_report(Kakao(), 'k', '주소', NOW)
        text = prompt_context(report)
        self.assertIn('출처: 카카오 로컬, 기준일 2026-11-14', text)
        self.assertIn('- 지하철역 (반경 1000m): 7곳 · 가까운 곳: SW8 가까운곳 120m', text)
        self.assertIn('새 숫자를 만들지 말 것', text)
        self.assertEqual(prompt_context({}), '')
        self.assertEqual(prompt_context(None), '')


SHOP = lambda large, middle: {'bizesNm': '가게', 'indsLclsNm': large, 'indsMclsNm': middle}
BUILDING_ROW = {'bldNm': '시험빌딩', 'dongNm': '', 'mainAtchGbCd': '0', 'mainPurpsCdNm': '업무시설', 'etcPurps': '사무소,근린생활시설',
                'strctCdNm': '철근콘크리트구조', 'grndFlrCnt': '12', 'ugrndFlrCnt': '4', 'useAprDay': '20050317',
                'platArea': '1520.3', 'archArea': '820', 'totArea': '15230.75', 'bcRat': '53.9', 'vlRat': '799.5',
                'indrAutoUtcnt': '80', 'oudrAutoUtcnt': '4', 'indrMechUtcnt': '0', 'oudrMechUtcnt': '', 'rideUseElvtCnt': '3', 'emgenUseElvtCnt': '1'}
ANNEX = {**BUILDING_ROW, 'bldNm': '부속창고', 'mainAtchGbCd': '1'}


class AllSources(Kakao):
    """Kakao plus synthetic data.go.kr and VWorld responses."""
    def __init__(self, public=None, vworld=None, **kw):
        super().__init__(**kw)
        self.public, self.vworld = public or {}, vworld or {}

    def get(self, url, params=None, headers=None, timeout=None, allow_redirects=None):
        if 'dapi.kakao.com' in url:
            return super().get(url, params, headers, timeout, allow_redirects)
        self.calls.append((url, dict(params or {}), dict(headers or {})))
        if 'storeListInRadius' in url:
            if 'commerce' in self.public:
                return self.public['commerce']
            page = params['pageNo']
            items = [SHOP('음식', '한식'), SHOP('음식', '카페'), SHOP('소매', '편의점')] if page == 1 else [SHOP('음식', '한식')]
            return Response(200, {'header': {'resultCode': '00', 'stdrYm': '202609'}, 'body': {'items': items, 'totalCount': 4}})
        if 'getBrTitleInfo' in url:
            if 'building' in self.public:
                return self.public['building']
            return Response(200, {'response': {'header': {'resultCode': '00'}, 'body': {'items': {'item': [BUILDING_ROW, ANNEX]}, 'totalCount': '2'}}})
        if 'getLandUseAttr' in url:
            if 'response' in self.vworld:
                return self.vworld['response']
            return Response(200, {'landUses': {'field': [
                {'prposAreaDstrcCodeNm': '일반상업지역', 'cnflcAtNm': '포함', 'lastUpdtDt': '2026-01-02'},
                {'prposAreaDstrcCodeNm': '일반상업지역', 'cnflcAtNm': '포함', 'lastUpdtDt': '2026-01-02'},
                {'prposAreaDstrcCodeNm': '지구단위계획구역', 'cnflcAtNm': '포함'},
                {'prposAreaDstrcCodeNm': '도로', 'cnflcAtNm': '접합'}], 'totalCount': '4', 'resultCode': ''}})
        raise AssertionError('unexpected request ' + url)


class PublicDataTests(unittest.TestCase):
    def report(self, **kw):
        state, report = build_report(AllSources(**kw), 'k', '서울 강남구 테헤란로 152', NOW, public_key='public%2Bkey%3D%3D', vworld_key='vw')
        self.assertEqual(state, 'done')
        return report

    def test_commerce_building_and_zoning_with_sources(self):
        sources = AllSources()
        _, report = build_report(sources, 'k', '서울 강남구 테헤란로 152', NOW, public_key='public%2Bkey%3D%3D', vworld_key='vw')
        shops = report['commerce']
        self.assertEqual((shops['status'], shops['total'], shops['counted'], shops['baseMonth'], shops['radius']), ('done', 4, 4, '2026-09', 500))
        self.assertEqual(shops['byCategory'], [{'name': '음식', 'count': 3}, {'name': '소매', 'count': 1}])
        self.assertEqual(shops['topSubcategories'][0], {'name': '한식', 'count': 2})
        register = report['building']
        self.assertEqual(register['count'], 1, 'annex buildings are left out')
        b = register['buildings'][0]
        self.assertEqual((b['mainUse'], b['floorsAbove'], b['floorsBelow'], b['approvedOn'], b['totalArea'], b['parking'], b['elevators']),
                         ('업무시설', 12, 4, '2005-03-17', 15230.75, 84, 4))
        zoning = report['landUse']
        self.assertEqual(zoning['pnu'], '1168010100108230000')
        self.assertEqual([z['name'] for z in zoning['zones']], ['일반상업지역', '지구단위계획구역', '도로'])
        self.assertEqual(report['sections'], {'kakao': 'done', 'commerce': 'done', 'building': 'done', 'landUse': 'done'})
        # The URL-encoded "Encoding" key is decoded once; requests encodes it again.
        public_calls = [c for c in sources.calls if 'data.go.kr' in c[0]]
        self.assertTrue(public_calls and all(c[1]['serviceKey'] == 'public+key==' for c in public_calls))
        register_call = next(c for c in public_calls if 'getBrTitleInfo' in c[0])[1]
        self.assertEqual((register_call['sigunguCd'], register_call['bjdongCd'], register_call['platGbCd'], register_call['bun'], register_call['ji']),
                         ('11680', '10100', '0', '0823', '0000'))
        land_call = next(c for c in sources.calls if 'getLandUseAttr' in c[0])[1]
        self.assertEqual((land_call['domain'], land_call['pnu']), ('https://spacepick.kr', '1168010100108230000'))
        text = prompt_context(report)
        self.assertIn('상가(출처: 소상공인시장진흥공단 상가(상권)정보, 기준 2026-09) 반경 500m 점포 4곳: 음식 3, 소매 1', text)
        self.assertIn('건축물대장(출처: 국토교통부 건축물대장) 시험빌딩: 업무시설, 지상 12층, 지하 4층, 사용승인 2005-03-17, 연면적 15230.75㎡, 주차 84대', text)
        self.assertIn('토지이용계획(출처: 국토교통부 토지이용계획(브이월드)): 일반상업지역(포함), 지구단위계획구역(포함), 도로(접합)', text)

    def test_unapproved_keys_mark_only_their_section(self):
        xml = Response(200, ValueError('xml'), '<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>')
        report = self.report(public={'commerce': xml, 'building': Response(200, {'response': {'header': {'resultCode': '30'}}})},
                             vworld={'response': Response(200, {'landUses': {'resultCode': 'INVALID_KEY'}})})
        self.assertEqual(report['commerce'], {'status': 'unavailable', 'error': 'public_unauthorized'})
        self.assertEqual(report['building'], {'status': 'unavailable', 'error': 'public_unauthorized'})
        self.assertEqual(report['landUse'], {'status': 'unavailable', 'error': 'vworld_unauthorized'})
        self.assertEqual(report['sections'], {'kakao': 'done', 'commerce': 'unavailable', 'building': 'unavailable', 'landUse': 'unavailable'})
        self.assertTrue(report['nearby'], 'Kakao data is kept')

    def test_no_data_is_an_empty_result_and_busy_servers_mark_only_their_section(self):
        report = self.report(public={'commerce': Response(200, {'header': {'resultCode': '03'}, 'body': {}}),
                                     'building': Response(200, {'response': {'header': {'resultCode': '00'}, 'body': {'items': '', 'totalCount': '0'}}})},
                             vworld={'response': Response(200, {'landUses': {'field': [], 'totalCount': '0'}})})
        self.assertEqual((report['commerce']['total'], report['building']['count'], report['landUse']['zones']), (0, 0, []))
        report = self.report(public={'commerce': Response(503, {}), 'building': Response(200, {'response': {'header': {'resultCode': '22'}}})},
                             vworld={'response': Response(502, {})})
        self.assertEqual((report['commerce'], report['building'], report['landUse']),
                         ({'status': 'failed', 'error': 'public_503'}, {'status': 'failed', 'error': 'public_quota'}, {'status': 'failed', 'error': 'vworld_502'}))
        self.assertEqual(report['sections']['kakao'], 'done')
        self.assertTrue(report['nearby'], 'Kakao data is kept when another source is down')

    def test_lot_number_needed_for_register_and_zoning(self):
        self.assertEqual(pnu({'bCode': '4167025021', 'mainNo': '12', 'subNo': '3', 'mountain': True}), '4167025021200120003')
        self.assertEqual(pnu({'bCode': '', 'mainNo': '12'}), '')
        road_only = {**ADDRESS_DOC, 'address': None}
        _, report = build_report(AllSources(address_docs=(road_only,)), 'k', '도로명만', NOW, public_key='p', vworld_key='v')
        self.assertEqual(report['building'], {'status': 'unavailable', 'error': 'lot_number_missing'})
        self.assertEqual(report['landUse'], {'status': 'unavailable', 'error': 'lot_number_missing'})

    def test_worker_asks_for_the_sections_it_can_build(self):
        self.assertEqual(sections_for(), ['kakao'])
        self.assertEqual(sections_for('p', 'v'), ['kakao', 'commerce', 'building', 'landUse'])
        asked = []
        class Db:
            def rpc(self, name, body):
                asked.append(body)
                return None
        refresh_next(Db(), 'k', AllSources(), lambda *a, **k: None, NOW, public_key='p')
        self.assertEqual(asked, [{'p_sections': ['kakao', 'commerce', 'building']}])


if __name__ == '__main__':
    unittest.main()
