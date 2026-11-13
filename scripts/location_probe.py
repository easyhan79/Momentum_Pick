"""Checks the location data keys against a public address and prints only statuses and counts.

Run by .github/workflows/location-probe.yml. Never prints keys or listing data. Each source is
checked on its own so one failing source does not hide the others.
"""
import datetime
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import requests  # noqa: E402
import location_data as ld  # noqa: E402

ADDRESS = os.environ.get('PROBE_ADDRESS') or '서울 중구 세종대로 110'  # Seoul City Hall, a public building.


def timed(name, build):
    started = time.monotonic()
    try:
        value = build()
        print('%s: ok (%.1fs)' % (name, time.monotonic() - started))
        return value
    except ld.LocationError as exc:
        print('%s: failed code=%s retryable=%s (%.1fs)' % (name, exc.code, exc.retryable, time.monotonic() - started))
    except Exception as exc:  # Unexpected parsing problems: type only, never the message.
        print('%s: error type=%s (%.1fs)' % (name, type(exc).__name__, time.monotonic() - started))
    return None


def main():
    kakao, public, vworld = (os.environ.get(k, '') for k in ('KAKAO_REST_API_KEY', 'PUBLIC_DATA_API_KEY', 'VWORLD_API_KEY'))
    print('keys present: kakao=%s public=%s vworld=%s' % (bool(kakao), bool(public), bool(vworld)))
    try:
        print('runner country (for VWorld overseas blocking):', requests.get('https://ipinfo.io/country', timeout=5).text.strip())
    except Exception:
        print('runner country: unknown')
    place = timed('kakao geocode', lambda: ld.geocode(requests, kakao, ADDRESS)) if kakao else None
    if not place:
        print('stop: no coordinate')
        return 1
    region = place['region']
    print('  matched=%s road=%s bCode=%s lot=%s-%s pnu=%s' % (place['matchedAddress'], place['roadAddress'], region['bCode'], region['mainNo'], region['subNo'] or '0', ld.pnu(region)))
    nearby = timed('kakao nearby', lambda: ld.nearby(requests, kakao, place['coordinate'])) or []
    for item in nearby:
        print('  %s r=%sm count=%s' % (item['label'], item['radius'], item['count']))
    fetched = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    ok = bool(nearby)
    if public:
        shops = timed('commerce', lambda: ld.commerce(requests, public, place['coordinate'], fetched))
        if shops:
            print('  total=%s counted=%s base=%s top=%s' % (shops['total'], shops['counted'], shops['baseMonth'], shops['byCategory'][:4]))
        register = timed('building', lambda: ld.building(requests, public, region, fetched))
        if register:
            first = (register.get('buildings') or [{}])[0]
            print('  status=%s count=%s first=%s/%s floors=%s approved=%s' % (register['status'], register.get('count'), first.get('name'), first.get('mainUse'), first.get('floorsAbove'), first.get('approvedOn')))
        ok = ok and bool(shops) and bool(register)
    if vworld:
        zoning = timed('landUse', lambda: ld.land_use(requests, vworld, region, fetched))
        if zoning:
            print('  status=%s zones=%s' % (zoning['status'], [z['name'] for z in zoning.get('zones', [])[:8]]))
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
