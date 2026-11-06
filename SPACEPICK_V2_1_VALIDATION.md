# SpacePick v2.1 검증 기록

## S0 기준 회귀 (2026-11-07)

- 명령: `PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js python scripts/check_v2_readiness.py`
- 결과: 25항목 모두 통과. 빌드/Edge 타입, Python 54개, Node 102개, 격리 SQL 3종 포함.
- 상세 생성 로그: `showroom-web/test-results/v2-readiness.json` (Git 제외).
- 운영 DB·실제 AI·고객 문의·운영 배포 요청 없음.
- 알려진 제약: 실제 운영 연결, 실제 제공자/자료 검증은 별도 미완료. 기준 통과를 운영 완료로 표시하지 않음.

## S1 — 목적·유형별 슬롯

- 단위 4개(customer-purpose), 기존 프로필 7개·등록 API 4개 통과. 프런트 build/typecheck 통과.
- `NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node showroom-web/scripts/v21-customer-qa.cjs`: 5유형 목적 전환/위험 안내/URL·source 유지/리로드/375·768·1440 통과, 페이지 오류·외부 요청 없음.
- 캡처/로그: showroom-web/test-results/v21-customer/ (합성, Git 제외).
- 샌드박스 기본 localhost 조회는 서버를 보지 못했으나 기존 서버는 별도 실행 환경에 살아 있었다. 새 시작은 포트 사용 중으로 종료; 기존 서버를 종료하지 않고 허용된 브라우저에서 검증했다.
- DB migration·운영 배포 없음. purpose query는 방문자 상태이며 매물 저장 API를 호출하지 않는다. 기존 industrial은 세부 유형을 추정하지 않는다.
