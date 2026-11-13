import datetime
import unittest
from location_data import CATEGORIES, LocationError, build_report, prompt_context, refresh_next


class Response:
    def __init__(self, status, data=None):
        self.status_code, self._data = status, data

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


if __name__ == '__main__':
    unittest.main()
