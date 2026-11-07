# SpacePick 운영 반영 작업 인계

상태: **미배포**. 사용자 요청은 운영 관리자 페이지에서 매물을 직접 등록하고, 입력/첨부를 AI로 분석한 뒤 정보·이미지를 수정·검수하여 게시할 수 있게 만드는 것이다. 사용 안내 파일이나 테스트 캡처만으로 완료 처리하지 않는다. 사용자는 운영 반영을 명시적으로 승인했다.

## 준비된 소스와 산출물

- 저장소: `easyhan79/Momentum_Pick`, 브랜치 `feature/spacepick-v2-1`.
- 기능/검증 소스: `a34f3e50ecb09e633df9f1e7dd50f2fb70516d85`, 기록 포함 `44d5a1c7e9de4bafcb4d76893f1fbcd64bf183d4`. 이후 문서·점검 SQL 추가 commit은 PROGRESS/RUN_STATE 확인.
- 배포 ZIP: `showroom-web/test-results/release/SpacePick-v2-release.zip`. 최초 기능 묶음은 284파일이고 archive SHA-256은 `98b51d755ea08da6c4710e7f958995b60f665f2b3d5b6ba2ff486950ad607b52`. 새 묶음을 만들면 새 manifest를 따른다.
- 프런트: `showroom-web/dist/server/index.js`의 Worker와 `.openai/hosting.json`. 일반 정적 페이지로 그대로 배포하는 산출물이 아니다.
- 기존 사이트 프로젝트: `appgprj_6ae876464cdc8191a6fdacb4d382dd60`. 운영 주소 `https://spacepick.kr`, 관리자 `https://spacepick.kr/admin`.
- Supabase 운영 프로젝트: `aklcylhqslgntkgloqpi`. 실제 대상·현재 버전을 관리 연결에서 다시 확인한다.
- 실행자: `web_worker.py`, `requirements-web-worker.txt`, `deploy/web-worker/`. DB/함수/프런트만 올리고 실행자를 연결하지 않으면 AI 분석 완료로 볼 수 없다.

## 필요한 실행 권한

현재 클라우드 채팅에는 기존 사이트 게시 도구·Supabase 관리 연결·조작 가능한 로그인 브라우저가 없다. 사용자 브라우저에서 로그인한 상태만으로 이 프로세스가 그 화면을 조작할 수는 없다. GH_TOKEN 이름이 존재하지만 GitHub API는 실제 호출에서 Forbidden이었다. 토큰이 만료됐다고 단정하거나 사용자에게 값을 채팅에 보내도록 요구하지 않는다. git 소스 push는 가능하다.

운영 반영은 실제 게시/배포 기능을 사용할 수 있는 작업 화면 또는 승인된 CLI/API 자격이 연결된 실행 환경에서 수행해야 한다. 기존 사이트를 생성·게시했던 화면에 이 문서와 배포 묶음을 전달하면 소스/준비 작업을 반복하지 않고 이어갈 수 있다. 관리 기능이 없는 이 채팅에서 실행 불가능한 배포 명령을 실행했다고 기록하지 않는다.

## 적용 순서

1. 현재 프로젝트·배포 버전·rollback 지점·DB migration 이력을 읽기 확인한다. `supabase/review/admin_web_production_preflight.sql`은 누락된 새 테이블이 있어도 동작하는 읽기 전용 구조 점검이며 고객 내용/키를 반환하지 않는다.
2. 실제 구조와 `supabase/migrations` 및 `docs/ADMIN_WEB_OPERATIONS.md`를 대조해 누락/차이를 확정한다. 비슷한 permanent_routes 두 파일이나 이미 적용한 migration을 무조건 재실행하지 않는다.
3. 기존 승인 snapshot/고객 URL/자료/문의/회수/예산을 보존할 백업과 전후 비교를 준비한다. 새 웹 작업 접수는 실행자·호환 코드가 준비되기 전 활성화하지 않는다.
4. 필요한 additive migration과 Edge 함수·공유 모듈을 적용한다. 기존 legacy 작업자가 web executor 행을 처리하지 않도록 DB/작업자 필터 버전을 함께 확인한다. 필요한 코드의 main 반영이 필요하면 배포 의존 순서를 지킨다.
5. 전용 웹 worker에 실제 프로젝트/환경/server credential/provider를 연결하고 heartbeat·한 회차 처리·재시작을 확인한다. 기본값 OFF인 flags는 준비 검증 후 활성화한다. API 이미지는 기본 OFF로 유지하고 명시적 비용 확인 요청만 허용한다.
6. 기존 호스팅 프로젝트에 Worker 프런트를 적용한다. 새 매물 입력 버튼이 실제 관리자 계정에 보이는지 확인한다. 관리자/원문/자료/미승인 결과를 공개하지 않는다.
7. 테스트로 식별되는 매물 하나를 웹에서 등록하고 로그아웃/재로그인 후 저장 ID와 원문/첨부를 확인한다. 중복 접수 없이 복구되는지 확인한다.
8. 저장한 텍스트/PDF로 실제 AI 분석을 한 번 요청하고 대기/실행/완료·지연/실패 표시를 확인한다. 결과는 검토 전 현재 문안/공개본에 자동 적용하지 않는다.
9. 정보/문구/이미지 수정·수동 Gemini 이미지 교체·미리보기·검수·게시·공개 링크를 실제로 확인한다. 기존 승인 매물은 자동 재게시하지 않는다.
10. 사용자 사용 안내 `docs/SPACEPICK_ADMIN_USER_GUIDE.md`를 실제 화면/정상 접속 주소/결과와 대조해 수정한다. 실제 배포 commit·함수/migration 버전·주소·시각·AI 및 저장/게시 검증을 RUN_STATE/PROGRESS에 기록한다.

## 완료 기준

- 사용자가 실제 주소에 로그인하여 **새 매물 입력**을 볼 수 있다.
- 입력한 매물과 자료가 서버에 저장되고 다시 열 수 있다.
- 실제 AI 결과를 상태 화면에서 받고 검토/선택 적용할 수 있다.
- 정보·문안·이미지를 고치고 보관한 뒤, 검수·게시한 고객 주소에서 확인할 수 있다.
- 기존 운영 자료와 승인본의 보호를 확인했다.
- 접속부터 저장·분석·수정·게시까지 실제 확인한 사용 안내를 전달했다.

코드 push, ZIP 생성, localhost 테스트, 이미지 캡처는 각각 준비·검증 증거이며 위 운영 완료 기준을 대신하지 않는다.
