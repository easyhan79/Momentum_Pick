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

## S2 — 근거·제약 4단 카드

- 신규 customer-decision 6개 통과: private 기본/검토·공개 별도, 서버 확인자, 기준일, 0/누락, 비공개 누출 방지, 값 충돌, 생성/해석 미승격, 근거 변경시 재검토, 명시적 확인 해제, 잘못된 날짜/타 유형 목적 거절, 기존 snapshot 호환.
- 기존 profile 7 / admin 21 / public 7 / document-review 7 통과. 프런트 build/typecheck 통과.
- S1 브라우저에 실제 공개 DTO의 판단 카드·비공개 값·기준일을 추가해 5유형×3너비 통과. 네 제목(결론/근거·기준일/의미·제약/추가 확인사항) 및 PRIVATE_SECRET 미노출 확인.
- 정보 기준일 asOf는 증빙 확인 시각과 별도이며 미입력은 '미제공'. 신규 프로필은 5상태 문구, 기존 legacy verified는 기존 '검토 기록 있음'을 유지한다.
- 관리자 목적 표시명·노출 목적 편집 재사용 JSON 확장. 새 분석 모듈은 별도 활성화·검토·공개 선택 전 고객에게 표시되지 않는다. DB migration/운영 요청 없음.
