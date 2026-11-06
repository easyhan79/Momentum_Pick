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

## S3 — 목적별 콘셉트·자료 표현

- concept-edits 3, plan-flow 4, image-settings 1, visual-evidence 1 및 Python image_worker 11 통과. Edge 타입·프런트 빌드 통과.
- 격리 SQL `concept-images-db.test.mjs` 통과: 오래된 슬롯 이미지 해제, 원본·예산·이력·승인본 보존, revision 및 실행 중 작업 차단, 권한 검사.
- 5유형×4자료 조합 20/20 브라우저 통과. 각 조합에서 375/768/1440, 목적별 활성 콘셉트/이미지, 사진·도면 표시 조건, 비공개 자료 미노출 검사. 실제 사진이 없는 Before 이미지는 만들지 않음.
- 첫 브라우저는 탭의 전체 접근성 이름과 테스트 선택자가 달라 실패; 안정된 ID로 수정. 두 번째는 19/20 후 검사 중 소스 변경에 따른 HMR로 중단; 변경을 멈추고 전체 20개 재실행해 통과. 실패를 숨기거나 통과 수에 합산하지 않음.
- 소스 코드와 합성 이미지·모의 공급자만 사용. 새 유료 호출/이미지 작업/예산 확대 없음. 목적 연결 변경은 기존 ID·무효화 RPC·비용 보호를 재사용한다.

## S4 — 공개 확인항목→문의/CRM

- 신규 API 5개, 기존 문의/CRM API 7개·공개 7개 통과. 프런트/Edge 타입·빌드 통과.
- V21_INQUIRY_QA=1 브라우저: 5유형 UI + 공개 공장의 목적/전력 확인 선택 → 실제 문의 handler → 기존 CRM의 인증된 상세 조회 연결 통과. 익명 CRM 401, 정규화 목적/콘셉트/체크 ID/추가 메모 연결 및 비공개 원자료 미노출 확인.
- 격리 SQL customer-inquiry-db 통과: 정확한 CRM 매물/메모, 동일 요청 재전송 1건 유지, 변경 fingerprint 거절, 다른 매물/승인 revision 거절, closed 차단, 기존 rate limit, 90일 보관 삭제, anon/authenticated RPC 실행 차단.
- 초기 타입 검사 실패는 배열 거절을 casting 이전으로 옮겨 수정. SQL fixture의 빈 승인 snapshot은 기존 CHECK에 의해 거절됐으며, CHECK를 변경하지 않고 유효한 합성 승인본으로 fixture를 고쳐 재검증했다.
- 추가 함수 migration은 저장시점의 승인 버전 경쟁을 막기 위해 필요하다. 기존 CRM memo 구조·보관/동의·알림·중복·속도 제한은 유지한다. 운영 DB/migration 적용 없음.

## S5 — 제공자료 기반 분석 품질

- analysis-quality 7개: 5유형별 입력/누락/충돌/비공개 매트릭스, 0의 의미, 부분 렌트롤, 법정 한도를 개발 가능 면적으로 바꾸지 않음, 동결 보고서/누출 보호, JSONB 순서 독립, 실제 관리자 save/publish→초안 변경 후 공개본 보존.
- customer-decision 6 및 기존 profile 7/admin 21/document 7/문의 문맥 5 회귀 통과. 프런트 build/typecheck 통과.
- analysis-snapshot-db: 실제 격리 PostgreSQL JSONB 저장·조회로 검토 기록 및 참조 일치와 draft UPDATE 후 published 보고서 불변 검증 통과.
- 초기 품질 검사는 부정형 경고문 '확정 수익률이 아님'을 긍정 주장으로 오인했다. 결론의 단정 검사와 한계 고지 존재 검사를 분리해 재검증했다.
- 보고서는 승인 시 동결하며 GET에서 재생성하지 않는다. 판단 문장은 inferred이고 근거 상태를 자동 verified로 올리지 않는다. 실제 AI/외부 데이터 호출 없이 수행한 제공자료 기반 1차 검토이며 운영/실자료 정확도 검증과 구분한다.

## S6 — 최종 통합·운영 준비 (2026-11-07)

- 최종 명령: `PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js python scripts/check_v2_readiness.py` → **35항목 모두 통과**, skipped/unrun/실패 0. Python **59개**, Node **141개**, 격리 SQL **6종**, Worker 빌드/Edge 타입 포함. 실행 콘솔 `/tmp/v21-s6-readiness-final.log`, 상세 `showroom-web/test-results/v2-readiness.json`.
- SQL 6종: 신규 매물 등록, 콘셉트 이미지 무효화/비용 보호, 비공개 PDF 버킷, 문의 문맥·승인 버전, 분석 JSONB/승인본 보존, Telegram 접수. 이후 문의 SQL에 읽기 전용 preflight 실행/권한 반환 검사를 추가했고 `PGLITE_MODULE=... node supabase/tests/customer-inquiry-db.test.mjs`로 해당 파일을 재검증해 통과했다.
- checkpoint Python 4개: 원자적 교체, 실패시 기존 기록 보존, 명시적 중단/재개·잘못된 단계 거절, Git 파일/원격 상태 보존. 상태를 실제 사용량 제한 없이 paused_limit로 바꾸지 않는다.

### 브라우저 명령과 최종 결과

다음 명령은 repo 루트 기준이며 공통 환경은 `NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium`이다. 설치된 Chromium과 허용된 로컬 실행 환경에서 사용한다. 모든 결과는 합성 자료/모의 API이고 운영 변경 요청을 차단한다.

| 명령 | 통과 그룹 | 결과 경로(test-results 하위) |
| --- | --- | --- |
| `V21_MATERIAL_QA=1 V21_INQUIRY_QA=1 node showroom-web/scripts/v21-customer-qa.cjs` | 21 | v21-customer/result.json |
| `V21_DOCUMENT_QA=1 node showroom-web/scripts/v21-customer-qa.cjs` | 5 | v21-professional/result.json |
| `V21_ADMIN_QA=1 node showroom-web/scripts/property-facts-qa.cjs` | 6 | v21-admin-journey/result.json |
| `SHOWROOM_QA_URL=http://127.0.0.1:5176 V21_ADMIN_QA=1 node showroom-web/scripts/property-facts-qa.cjs` | 6 | v21-admin-built/result.json |
| `node showroom-web/scripts/industrial-review-qa.cjs` | 8 | v2-industrial/result.json |
| `PDF_REVIEW_QA=1 node showroom-web/scripts/property-facts-qa.cjs` | 7 | v2-pdf/result.json |
| `RENTAL_SCENARIO_QA=1 node showroom-web/scripts/property-facts-qa.cjs` | 6 | v2-rental/result.json |
| `COPY_REVIEW_QA=1 node showroom-web/scripts/property-facts-qa.cjs` | 5 | v2-copy-review/result.json |

최종 **64그룹 통과**, 각 result의 failures와(있는 경우) errors/unexpected 빈 배열. 자료 조합은 최소/도면/사진/둘다 20사례에 전문자료 5사례를 추가했다. 전문자료 원문 경로/asset ID/권한 메타데이터는 공개 DTO에서 제외한다. 부분 렌트롤은 제공 1층/3층만 표시하고 누락 2층·비공개 계약은 만들거나 공개하지 않는다.

빌드 검증 서버: showroom-web에서 `SPACEPICK_QA_PORT=5176 node scripts/serve-built.mjs`. 생성 Worker를 제공하되 서버의 메타데이터 조회도 합성 응답으로 고정한다. 일반 개발 서버와 빌드 서버를 구분해 결과를 보존했다. 주요 캡처 `v21-admin-built/public-1440.png`와 각 유형/자료 폴더, 375/768/1440px 주요 동작 통과.

### 발견·수정 및 재검증

- 실제 중복 React key(목적 컴포넌트와 임대 계산기가 같은 data.id 사용)를 발견해 목적 key에 구분 접두사를 추가했다. 고객 QA에서 duplicate key 콘솔도 실패로 수집하며 최종 전체 조합은 오류 없이 통과했다.
- 관리자 공개 범위·목적 preview select에 명시적 접근성 이름과 fieldset legend를 추가했다. 검사 selector만 우회하지 않고 최종 관리자/빌드 여정을 다시 통과했다.
- 빌드 QA 첫 실행은 잘못된 작업 경로와 CHROME_PATH 누락으로 시작에 실패했다. 올바른 cwd/설치된 Chromium 경로를 사용한 재실행 6그룹이 통과했고 별도 v21-admin-built 결과에 보존했다.
- 기존 패키지 도구가 `.sql`을 선택하지 않아 migration을 누락하는 문제를 발견했다. SQL/검토/서버 테스트·루트 작업지시/상태·보고서를 포함하도록 고쳤다. 깨끗한 소스 체크포인트에서 232파일을 압축하고 모든 manifest 해시·새 SQL/프런트 재빌드 입력/루트 상태 파일 포함·원본/비밀파일 제외 검사를 통과했다.

운영 preflight는 로컬 격리 DB에서만 실행했다. 실제 DB migration·함수/사이트 배포·실매물·유료 AI 호출·외부 시장 데이터 정확도 검증은 미수행이다. 적용 순서/복구는 `SPACEPICK_V2_1_DEPLOYMENT.md`, 남은 범위는 `SPACEPICK_V2_1_REPORT.md`에 분리했다.
