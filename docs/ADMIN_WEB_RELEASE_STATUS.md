# 관리자 웹 전환 최종 로컬 검증 / 운영 미전환

2026-11-07 한국시간. 사용자가 W1~W2 이후 전 단계를 자동 진행하도록 승인했다. W1~W6 로컬 구현과 W7에서 독립적으로 가능한 검증을 완료했다. W8/W9도 준비물·검증 절차를 작성했으며 **실제 시험/운영 배포·실매물 pilot·Telegram 입력 종료는 수행하지 않았다.**

| 단계 | 완료한 내용 | 실제 환경에서 남은 내용 |
| --- | --- | --- |
| W1 | 간단/자료 등록, 원문 버전, 서버 자동저장, 접수/응답 복구, 단위 확인 후보 | 운영 적용 |
| W2 | 고정 실행 입력/PDF 참조, request replay, executor/epoch/token/lease, 취소/선택 반영 | 실제 migration·실행 동시성 관측 |
| W3 | 기존 분석/provider/editorial 재사용, Telegram·dispatch 무관 진입, 문안/도면/이미지 단계 분리 | 실제 AI 1건의 품질·과금·Storage 연결 확인 |
| W4 | 상시 worker·독립 heartbeat/lease·종료·candidate 재개·환경 차단·systemd 준비 | 호스트/사양·비용 확인, 설치·재시작/장애 관측 |
| W5 | 웹 상태/안전 오류/취소/원문 변경 차단/결과 비교·선택 적용 | 실제 서버 접수~완료 확인 |
| W6 | Gemini 웹 프롬프트/AI 결과 보관·출처·비교·대표/콘셉트 지정, manual override/무과금 기본/명시적 API 한 장 | 실제 Gemini 이미지 구조·권리 대조 |
| W7 | 로컬 회귀·5유형×자료·별도 합성 staging 빌드, owner/환경 혼용/공개 우회 차단 | 실제 본인 전용 호스팅/격리 프로젝트/계정 시험 배포 |
| W8 | 읽기 전용 inventory RPC/CLI, queue 소유권 분리·승인 digest/예산 보존 검사·pilot 절차 | 실제 inventory, 선택 매물 pilot·실행자 이전 기록 |
| W9 | 접수 중단/정상 종료/필터 유지/복구/관측 절차와 기록 항목 | 실제 전환·관측·롤백 검증 및 Telegram 주 입력 종료 판단 |

## 로컬 증거

- `showroom-web/test-results/v2-readiness.json`: 46항목 전부 통과. 고정 worker 가상환경 Python 75, Node 176, 격리 SQL 10, 프런트 빌드·Edge 타입 포함.
- 새 관리자 전체 흐름: 개발 빌드 7 + 배포용 빌드 7 + 별도 합성 staging 빌드 7 그룹 통과. 초기 접수/저장 응답 유실·재로그인·원문 보존·stale 결과 차단·새 결과 선택 적용·AI 이미지 업로드/선택·유료 이미지 job 0 확인.
- 기존 고객 화면: 5유형×최소/도면/사진/혼합 20조합 + 문의→CRM 1 + 5유형 PDF 5조합 통과. 375/768/1440px, 목적/조건/출처/비공개 값 제외 확인.
- 신규 queue API는 5유형×최소/사진/도면/PDF 20조합의 지원 범위를 검사한다. 사진·도면 보관을 PDF 분석/사진 판독 완료로 오표시하지 않는다.
- private-preview API/클라이언트/router 7검사: 다른 관리자·누락 owner·운영 URL 혼용·타 origin·공개 조회/이미지/문의 경로 차단.
- 실제 AI·공급자 정확성·실제 과금·운영 동시성/접속권한은 위 합성 검사에 포함하지 않았다. 외부 서비스에 매물/알림을 전송하지 않았다.

## 현재 연결 제한과 재개 순서

cloud-environment-runtime 및 cloud-desktop 절차로 현재 환경을 조회하고 도구를 재탐색했다.

- 환경 ID: `ccarenv_b64_Y2NhcmVudl9hNDAyNmVlYWU1Yzg4MTkxOWQzMzhjNmZkYzBkYTI4OA`. running/connected, observations_current=true, spec/observed revision=1, network restricted/enforced.
- remote_desktop enabled=true, state=unknown. 화면을 제어/검사하는 `cua_repl.js` 또는 NodeREPL desktop js 도구와 `open_in_codex`가 제공되지 않았다. 이 상태를 실제 Chrome 로그인/사이트 접근 성공으로 간주하지 않았다.
- 현재 제공 도구에는 기존 사이트 게시/호스팅 관리 또는 Supabase 관리 기능이 없고, 준비된 secret/runtime variable/outbound identity도 없다. GitHub 소스 push는 가능하지만 사이트·DB·worker 배포 연결과는 별개다.
- 패키지 설치는 허용된 저장소와 기존 proxy/TLS를 사용했다. Supabase/AI/운영 호스팅 자격을 브라우저 파일·쿠키에서 추출하거나 임의로 만들지 않았다.

연결 후 [운영 절차](ADMIN_WEB_OPERATIONS.md) 순서로 실제 대상/배포 버전·본인 ID·격리 프로젝트를 확인한다. 먼저 읽기 전용 inventory를 기록하고 시험 환경에서 설치·실제 AI 1건·오류 복구를 검증한다. 그 뒤 W8/W9를 실행한다. DB 열/작업/승인 snapshot 삭제·큐 attempt/budget 초기화·필터 없는 이전 worker 복원은 수행하지 않는다.

실제 대상 값이 없는 `.env.example`과 systemd 파일은 준비 예시다. 합성 staging ref/호스팅 ID는 로컬 검증 전용이며 실제 생성한 프로젝트가 아니다. 최종 배포용 산출물은 기존 운영 프로젝트 설정으로 다시 빌드하되 게시하지 않았다.
