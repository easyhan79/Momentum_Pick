"""Checks the location data keys against a public address and prints only statuses and counts.

Run by .github/workflows/location-probe.yml. Never prints keys or listing data.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import requests  # noqa: E402
from location_data import LocationError, build_report  # noqa: E402

ADDRESS = os.environ.get('PROBE_ADDRESS') or '서울 중구 세종대로 110'  # Seoul City Hall, a public building.


def main():
    kakao = os.environ.get('KAKAO_REST_API_KEY', '')
    public = os.environ.get('PUBLIC_DATA_API_KEY') or None
    vworld = os.environ.get('VWORLD_API_KEY') or None
    print('keys present: kakao=%s public=%s vworld=%s' % (bool(kakao), bool(public), bool(vworld)))
    if not kakao:
        print('result: kakao key missing')
        return 1
    try:
        state, report = build_report(requests, kakao, ADDRESS, public_key=public, vworld_key=vworld)
    except LocationError as exc:
        print('result: failed code=%s retryable=%s' % (exc.code, exc.retryable))
        return 1
    print('result:', state)
    if state != 'done':
        return 1
    region = report['region']
    print('kakao: matched=%s road=%s bCode=%s lot=%s-%s' % (report['matchedAddress'], report['roadAddress'], region['bCode'], region['mainNo'], region['subNo'] or '0'))
    for item in report['nearby']:
        print('  %s r=%sm count=%s nearest=%s' % (item['label'], item['radius'], item['count'], item['nearest'][0]['distance'] if item['nearest'] else '-'))
    for name in ('commerce', 'building', 'landUse'):
        section = report.get(name)
        if not section:
            print('%s: skipped (no key)' % name)
        elif section['status'] != 'done':
            print('%s: %s code=%s' % (name, section['status'], section.get('error')))
        elif name == 'commerce':
            print('commerce: total=%s counted=%s base=%s top=%s' % (section['total'], section['counted'], section['baseMonth'], section['byCategory'][:4]))
        elif name == 'building':
            first = section['buildings'][0] if section['buildings'] else {}
            print('building: count=%s first=%s/%s floors=%s approved=%s' % (section['count'], first.get('name'), first.get('mainUse'), first.get('floorsAbove'), first.get('approvedOn')))
        else:
            print('landUse: pnu=%s zones=%s' % (section['pnu'], [z['name'] for z in section['zones'][:8]]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
