# 등록 매물 다시 글작성

2026-11-07 한국시간. 로컬 구현·검증 완료, 운영 배포·실제 AI 호출 검증 미완료. 기존 운영 데이터·승인 쇼룸은 변경하지 않았다.

## 사용 흐름

1. 관리자 **등록 매물 → 다시 글작성**을 누른다. 초안 안에서도 같은 작업 영역을 볼 수 있다.
2. 쇼룸 제목·요약·블로그 2종·카드뉴스 중 원하는 항목을 선택한다. 매물 이름은 변경하지 않는다.
3. 선택적으로 “실사용자 중심으로”, “더 짧게”, “근거와 확인 조건 중심으로” 같은 작성 방향을 입력하고 요청한다.
4. 완료된 새 글을 기존 글과 비교한다. **새 글을 비공개 초안에 적용** 또는 **새 글 사용 안 함·기존 글 유지**를 선택한다.
5. 적용한 쇼룸 문안은 기존 검수·승인을 거쳐야 고객 공개본에 반영된다. 광고 콘텐츠도 별도 검토한다.

저장하지 않은 쇼룸·광고 편집이 있으면 먼저 저장해야 한다. 생성 중 다른 편집자가 저장하면 오래된 결과를 적용하지 못한다. 작성 중 새로고침·재로그인해도 요청과 비교 결과는 DB에 남고, 진행 중 요청의 선택 항목과 작성 방향이 복원된다.

## 구현과 보호

- 기존 최초 매물 분석을 다시 실행하지 않는다. `properties.ai_contents`, 사진·도면·콘셉트·사실정보·기존 승인 snapshot을 덮어쓰지 않는다.
- private `property_copy_rewrites` 큐에 기존 문구/저장 revision/작성 방향/사용 권한이 있는 제공정보를 저장하고 별도의 문안 후보를 생성한다.
- 새 결과는 선택한 문안 키만 허용하고 길이·문자열·응답 구조를 검사한다. 내부 구분 표시는 자연스러운 문장으로 정리한다. 이 검사는 사실 검증이나 실제 생성 품질 보장이 아니다.
- 신뢰할 수 있는 제공/검증 필드를 입력으로 사용한다. 구조화 프로필이 있으면 오래된 raw_input을 합치지 않으며, 개인정보용 담당자 필드·권한 없는 사실·해석값은 새 근거로 넣지 않는다. 프로필 없는 기존 매물의 텍스트에서는 첨부 다운로드 태그를 제거한다. 원문/기존 글/작성 방향 속 명령은 생성 지시로 신뢰하지 않는다.
- 적용은 DB에서 매물 ID/작업 ID/저장 revision을 다시 확인하고 선택 필드만 갱신한다. 작업과 초안 변경은 같은 트랜잭션이다. 적용 재전송은 같은 revision에 한 번만 반영된다.
- 매물별 한 시간에 새 요청 최대 3회, 동시에 미결 요청 하나, 작업당 최대 3회 시도, 10분 lease와 재시도 대기, 한 worker 실행당 최대 2건. 기존 공급자별 fallback과 240초 제한을 재사용한다. 임의의 추가 모델 호출·이미지 작업·Telegram 발송 없음.
- 취소·폐기한 작업의 늦은 응답은 claim token/state 검사로 거절한다. 생성 완료/영구 실패/폐기 후 근거 입력을 비우고, 적용·폐기·실패 기록은 worker에서 90일 후 정리한다. `done` 비교 대기 결과는 명시적 선택 전 유지한다.
- 테이블과 RPC는 service_role만 접근한다. 브라우저는 기존 관리자 인증 API를 사용하며 상태 응답에서 source/claim token/actor/비선택 데이터를 제외한다. 공개 DTO에는 재작성 기록을 추가하지 않는다.

## 운영 적용 순서

1. 기존 DB/함수·worker·프런트 버전과 rollback 경로를 확인한다. 기본은 비활성화이며 배포 연결은 아직 없다.
2. 기존 `properties`, `auth.users`, `property_showrooms` 선행 구조를 확인하고 additive **`supabase/migrations/20261107020000_copy_rewrites.sql`**만 필요한 경우 적용한다. 기존 데이터를 갱신하는 migration은 아니다.
3. 기존 저장소의 검증된 worker·workflow를 운영 배포 경로에 반영한다. 전용 `.github/workflows/copy-rewrite.yml`은 `copy_rewrite_worker.py`를 실행한다. 기존 provider/server secrets를 사용한다. 개발 브랜치 업로드만으로 `main` 대상 dispatch가 동작하지는 않는다.
4. 변경된 `showroom-admin`/공통 모듈을 적용한다. 기존 GitHub 토큰 별칭 `GITHUB_PAT_TOKEN`을 포함해 기존 연결을 재사용한다. DB migration과 workflow가 준비된 후 GitHub repository variable `COPY_REWRITE_ENABLED=true` 및 해당 함수의 환경 설정 `COPY_REWRITE_ENABLED=true`를 활성화한다. 실제 값이나 키를 코드/문서/채팅에 넣지 않는다.
5. 프런트 Worker를 적용하고 합성 전용 매물에서 실제 로그인→요청→AI 결과→비교→초안 적용/폐기와 기존 공개본 보존을 검증한다. AI 재작성에는 기존 공급자의 호출 비용이 발생할 수 있으며 이번 개발 검사는 실제 공급자를 호출하지 않았다.
6. commit·migration 이력·함수/프런트 버전·작업 결과를 PROGRESS에 기록한다. 실패 시 활성화를 해제하고 이전 프런트/함수를 복구한다. 운영 매물/승인본을 되돌리거나 새 테이블을 파괴적으로 삭제하지 않는다.

## 로컬 검증

- 통합 명령: `PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js python scripts/check_v2_readiness.py` → **37항목 통과**. Python **65개**, Node **146개**, 격리 SQL **7종**, 빌드·Edge 타입 포함. 상세 `showroom-web/test-results/v2-readiness.json`, 콘솔 `/tmp/copy-rewrite-readiness-final.log`.
- 새 worker Python 6개, 관리자 API 5개, 격리 SQL 큐/중복/속도/lease/취소/오래된 revision/권한/선택 적용·승인본/이미지 보존 검사 통과.
- 브라우저: `PGLITE_MODULE=... NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules CHROME_PATH=/usr/bin/chromium node showroom-web/scripts/copy-rewrite-qa.cjs`. 실제 admin handler와 격리 PostgreSQL RPC를 연결하고 생성 결과만 합성으로 공급한다. 5그룹 통과, 375/768/1440px 비교·적용·실패/재요청·취소·편집 보호·재로그인 복원 검사.
- 최종 빌드: showroom-web에서 `pnpm run build`, `SPACEPICK_QA_PORT=5180 node scripts/serve-built.mjs`로 외부 메타데이터 호출을 차단한 Worker 실행 후 위 명령에 `SHOWROOM_QA_URL=http://127.0.0.1:5180`을 추가해 확인한다. 실제 빌드 5그룹도 통과했고 결과/캡처는 `test-results/copy-rewrite-built/`에 별도로 저장했다.
- 기존 문구 편집 `COPY_REVIEW_QA=1 ... node showroom-web/scripts/property-facts-qa.cjs` 5그룹 통과. 기존 관리자 전체 여정도 `V21_ADMIN_QA=1`로 6그룹 통과했다. 이번 브라우저 검증 합계는 21그룹이다.
- 발견/수정: SQL CASE 비교에 괄호를 추가한 뒤 SQL 전체 재검증 통과. 첫 브라우저는 로컬 서버 중단으로 시작 실패해 서버를 시작했다. 다음 실행의 중복 저장 버튼 선택자는 폼으로 범위를 한정했다. 새로고침 후 선택 항목 기본값 복원 문제는 실제 UI를 수정해 전체 5그룹 재검증했다. 최종 CSS는 비교 칼럼과 체크박스를 작은 화면에서도 읽을 수 있게 정리하고 최종 빌드/브라우저로 확인했다.

실제 공급자 응답의 사실성/문체 품질, 운영 migration·함수·스케줄·dispatch·사이트 배포는 별도 미검증이다. 기존 S0~S6 로컬 완료와 본인 전용 배포 연결 대기는 유지한다.
