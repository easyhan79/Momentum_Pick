# SpacePick v2 검증·적용·재개 안내

## 현재 검증 범위

로컬 빌드, 프런트/Edge 함수 타입 검사, 합성 API/AI 응답, 격리된 PostgreSQL 호환 DB, 실제 Chromium UI를 사용한다. 실제 Supabase 프로젝트·AI 제공자·고객에게 요청을 보내는 검증이 아니다.

현재 환경에서 `scripts/check_v2_readiness.py`의 24개 검사 항목이 통과했다. Node 사례 96개, Python 사례 48개, 별도 SQL 시나리오 3종을 실행했다. 상세 로그는 `showroom-web/test-results/v2-readiness.json`이며 생성물이므로 Git에는 포함하지 않는다. 스크립트는 시작/각 검사 전후에 원자적으로 결과를 저장한다. 중간 종료 시 complete=false 및 current_check로 재개 위치를 확인한다. 이 숫자는 이후 테스트가 추가되면 바뀔 수 있다.

## 기본 환경

- 기존 체크아웃 `/workspace/Momentum_Pick`, Node 24, pnpm.
- 웹: `cd showroom-web && pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store`.
- Python 검증에는 pydantic v2가 필요하다. 실제 분석 작업의 버전 핀은 `.github/workflows/agent.yml`을 따른다. 이 세션의 로컬 Python은 pydantic 2.13.4로 검증했다. 운영 워크플로에 핀된 2.14.2에서 이번 변경을 실제 실행한 것은 아니다.
- 관리자 PDF 뷰어: pdfjs-dist 5.6.205를 package.json/lockfile에 고정했다. pnpm install --frozen-lockfile로 설치한다. Worker·CMap·폰트·디코더·라이선스를 같은 사이트에 포함하며 외부 CDN을 사용하지 않는다. 렌더러는 원문 보기 버튼을 누를 때만 지연 로드한다.
- PDF 작업자 의존성: `pip install -r requirements-pdf.txt`(pypdf 6.10.0). 합성 PDF 검증: `pip install -r requirements-validation.txt`(reportlab 4.4.9 포함). pydantic v2 등 기존 Python 의존성도 필요하다.
- SQL 테스트는 앱 의존성과 분리한 `@electric-sql/pglite@0.3.14`를 사용한다.

```bash
npm install --prefix /workspace/spacepick-test-tools --no-audit --no-fund @electric-sql/pglite@0.3.14
cd /workspace/Momentum_Pick
PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js python scripts/check_v2_readiness.py
```

SQL 도구가 없으면 해당 검사는 `unrun`으로 기록하고 전체 검사 종료 코드는 1이다. 실행하지 않은 검사를 통과로 취급하지 않는다. Node 사례 수를 확인하려면 `node supabase/tests/property-profile.test.ts`처럼 파일을 직접 실행한다. 이 환경의 `node --test` 기본 요약은 파일 단위로 보일 수 있다.

## 브라우저 검사

로컬 Vite 서버를 `showroom-web`에서 `pnpm run dev`로 실행한다. 이 세션에서는 이전부터 실행 중인 5173 서버를 사용했다. 서버가 실행 중인지 먼저 확인하고 다른 작업의 서버를 종료하지 않는다.

Playwright 및 Chromium은 실행 환경 제공 설치를 사용했다. 다른 환경에서는 설치 위치에 맞춰 아래 경로를 바꾼다. 다음 명령은 `showroom-web` 디렉터리에서 실행한다.

```bash
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/industrial-review-qa.cjs
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/property-facts-qa.cjs
WEB_REGISTRATION_QA=1 NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/property-facts-qa.cjs
RENTAL_SCENARIO_QA=1 NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/property-facts-qa.cjs
# 실제 한국어 텍스트/이미지 페이지/암호화 PDF와 대조 결과 생성
python ../scripts/generate_pdf_qa_fixture.py
PDF_REVIEW_QA=1 NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/property-facts-qa.cjs
```

- `SHOWROOM_QA_URL`로 다른 로컬 포트를 지정할 수 있다. 외부 호스트는 허용하지 않는다.
- 첫 검사는 7개 예시의 유형별 모듈·생략·순서·375/768/1440 폭을 검사한다.
- 두 번째는 실제 관리자/공개 핸들러와 메모리 DB로 편집→저장→미리보기→검수→공개를 검사한다.
- 세 번째는 웹 신규 등록→분석 요청→콘셉트 가져오기→추가/삭제/순서변경→이미지 방식→문서 상충 후보의 비공개 가져오기를 검사한다.
- 네 번째는 임대 계산 비공개 기본값·별도 승인·원본 출처 표시·방문자 공실/누락 변경·복원·승인본 유지를 검사한다.
- 다섯 번째는 실제 pypdf 결과를 사용하는 PDF 오류→제외→재요청, 문구/값/페이지 대조 상태, 원본 SHA256 다운로드, 비공개 가져오기/출처 이력, 375/768/1440 폭을 검사한다. 내장 뷰어의 한국어/실제 이미지 페이지·이동/확대·잘못된 페이지·키보드 닫기/포커스 복원·암호화/손상/권한/원본 digest 변경·PDF JavaScript/URI 비실행도 확인한다. 제공자 응답과 DB/네트워크는 합성이다.
- 실제 로그인 계정, 운영 DB, AI 제공자는 사용하지 않는다. 모든 비로컬 브라우저 요청은 합성 응답으로 처리하거나 차단한다.
- 검사 중 소스 파일을 수정하면 Vite가 페이지를 다시 로드하여 로그인 상태가 초기화될 수 있다. 소스 변경을 마친 후 검사를 실행한다.
- 실제 빌드 검증: pnpm run build 후 node scripts/serve-built.mjs로 127.0.0.1:5174에 실행한다. 이 합성 서버는 Worker의 서버측 공개 메타데이터 요청도 로컬 응답으로 처리해 운영 서버에 접속하지 않는다. SHOWROOM_QA_URL=http://127.0.0.1:5174를 PDF_REVIEW_QA 명령에 추가한다.
- 결과와 스크린샷은 `showroom-web/test-results/v2-{industrial,facts,registration,rental,pdf,pdf-built}` 아래에 있다.

## 운영 적용 전 순서

아래는 준비된 적용 순서이며, 이번 작업에서 실제 운영에 적용하지 않았다.

1. 기존 운영 스키마와 migration 적용 이력을 확인한다. 이번 변경의 전제는 기존 showroom/private media/analysis queue/image budget 함수들이 존재하는 것이다.
2. DB 백업과 변경 검토 후 다음 migration을 순서대로 적용한다.
   - `20261105140000_web_property_registration.sql`
   - `20261105150000_concept_edit_consistency.sql`
   - `20261105151000_generated_image_classification.sql`
   - `20261105160000_private_pdf_uploads.sql`
3. `showroom-admin`, `showroom-assets`, `public-showroom` 및 참조하는 `_shared` 모듈을 함께 배포한다.
4. GitHub 작업의 Python 분석/이미지 코드가 같은 버전을 사용하는지 확인한다. 새 문서 응답 스키마, `document_sources.py`, `pdf_evidence.py`, `requirements-pdf.txt`도 포함한다. PDF 파서 의존성이 없으면 AI 호출 전 명시적인 오류로 멈춘다.
5. 프런트·Worker를 빌드하고 배포한다. DB/함수 변경보다 새 UI가 먼저 배포되지 않도록 한다.
6. 별도 합성 매물로 실제 인증·저장·분석 대기열·PDF 원본·공개 응답·비공개 차단을 확인한 후 실제 매물에 적용한다.

새 RPC가 없는 서버에서는 웹 등록/콘셉트 변경이 작동하지 않는다. 기존 승인본을 덮어쓰거나 임의로 새 migration을 이미 적용됐다고 가정하지 않는다. 버킷 MIME migration은 기존 공개 여부나 NULL MIME 제한을 바꾸지 않는다.

## 실제 서비스 검증에서 남은 것

- 현재 실행 환경에는 Supabase 서버 인증, AI 제공자 키, PUBLIC_DATA_API_KEY가 주입되어 있지 않다. 이름별 존재 여부만 확인했고 값은 읽거나 출력하지 않았다. GitHub Actions 쪽 저장 상태나 권한은 이 검사로 판단하지 않는다.
- 실제 매각제안서 원본이 이번 요청에 첨부되지 않았다. 제공된 두 분석 문서는 원본 PDF 정확도 검증을 대신하지 않는다.
- 합성 한국어 PDF에서 텍스트 추출·인용문/값/단위/페이지 대조, 암호화/손상/쪽수 초과/시간 초과, 텍스트 없는 이미지 페이지를 검사했다. 실제 고객 PDF의 정확도와 제공자의 응답 품질, OCR 인식, 실제 이미지의 구조 보존 품질은 아직 확인해야 한다.
- PDF 원본은 관리자 내장 페이지 보기 또는 다운로드로 대조한다. PDF.js 화면 렌더링과 독립 pypdf 프로세스의 문구 일치 판정은 구분한다. OCR 엔진은 미구현이다. 문구 일치는 사실 검증이나 공개 승인을 의미하지 않는다.
- 내장 뷰어도 인증된 기존 action=document endpoint만 사용한다. 8MB/100쪽, 열기·현재 페이지 표시 각각 20초, 이미지 최대 1600만 화소·화면 canvas 400만 화소 한도가 있다. 매우 큰 이미지/복잡한 문서는 다운로드한 원본과도 대조한다. 본문/텍스트는 브라우저 메모리에만 두고 닫기/파일 교체 때 요청·렌더링·worker를 정리한다. 페이지 순서는 PDF 물리 페이지이며 인쇄 쪽수와 다를 수 있다.
- 후보에 원본 SHA256이 있으면 다운로드 bytes와 대조하고 바뀐 원본으로는 대조를 진행하지 않는다. 뷰어 열기만으로 가져오기/verified/공개 승인/분석 요청을 실행하지 않는다. canvas만 렌더링하며 PDF JavaScript, 링크/첨부 실행 계층을 추가하지 않는다.
- PDF 파일당 8MB/100쪽, 입력 합계 24MB/160쪽, 프로세스 15초/CPU 10초/주소공간 512MiB 제한. 페이지 stream 2MiB, 페이지 텍스트 4만/전체 40만 자 한도를 적용하고 제한/읽기 실패 페이지를 표시한다. 페이지 텍스트는 임시 처리하며 DB에 전체를 복제하지 않는다.
- 임대 계산은 입력값 기반 세전 운영수지 시나리오다. 금융비용·세금·초기공사비·보증금 차감이 제외되므로 투자수익률로 사용할 수 없다. 자동 시세/공실률 조회나 실제 임대차 검증은 수행하지 않는다.
- 지적/규제/임대시장 데이터 공급원과 사용 조건을 확정하기 전에는 입지·가격·수익 예측이 작동한다고 표시하지 않는다.

## 중단 후 재개

먼저 [개발계획·작업상태](SPACEPICK_V2_PLAN.md)의 현재 위치와 마지막 기록을 읽고 실제 `git status --short`/diff를 대조한다. 로컬 변경은 commit/push/환경 재게시되지 않았으며, 다른 컴퓨터의 체크아웃에 자동 반영되는 상태는 아니다. 이미 끝난 단계를 다시 적용하지 말고, 미완료 항목부터 이어간다.

## T11 고객 정보 보강 검증 (2026-11-06)

- 핵심 요약은 제공정보/검토 기록이 있는 값만 사용하고 AI 가설/확인 필요 값을 실제 조건으로 올리지 않는다. 0값과 같은 key의 복수 기록을 보존한다. 계약 현황과 제안·예상 조건은 별도 표시한다.
- 자료 요청은 현재 화면 상태로 관리하며 문의 제출 시 기존 memo에 합친다. 최대 12개/항목 120자 이하, 직접 입력과 함께 2000자 이내다. 실제 문의 endpoint/schema는 유지한다. 제공 가능/공개 권한을 자동 승인하지 않는다.
- 단일 HTML 생성: showroom-web에서 node scripts/export-review-preview.mjs. 확인: NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node scripts/review-preview-qa.cjs. 4유형 정보 제공 예시와 기존 최소 자료, 요청 선택/해제, 375/768/1440 폭을 검사한다.
- 실제 문의 컴포넌트: CUSTOMER_REQUEST_QA=1을 property-facts-qa.cjs 명령 앞에 추가한다. 선택한 자료+직접 쓴 메모가 기존 문의 payload에 함께 담기고 한 번만 제출되는지 합성 인증/DB/문의 응답으로 검사한다. 운영 알림/고객 문의를 생성하지 않는다.
- T11 자체는 신규 migration이 필요 없다. 다만 이 작업 디렉터리에는 앞선 T04~T09의 서버/DB 변경도 미적용 상태로 있으므로, 전체 프런트를 적용하기 전에 기존 운영 버전과 VALIDATION의 migration/함수 적용 순서를 확인해야 한다.
