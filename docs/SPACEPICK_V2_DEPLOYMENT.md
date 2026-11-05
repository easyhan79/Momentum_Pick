# SpacePick 고객 정보 보강 배포 기록

2026-11-06 (한국시간). 사용자는 고객 정보 보강 후 운영 서버에 반영하도록 승인했다.

## 준비된 변경

- 매물 유형별 핵심 조건, 실제 이용/임대·운영 정보, 미제공 상세항목 접기.
- 고객 질문별 확인 이유·요청 자료 및 선택한 자료의 문의 메모 전달.
- 실제 정보/확인사항을 AI 활용안보다 먼저 보여주는 고객 화면.
- 기존 화면 컴포넌트의 로컬 미리보기와 정보 제공/최소 자료 합성 예시.

통합 검사 24항목(Node 96개, Python 48개, SQL 3종, 빌드/타입 검사), 미리보기 9항목, 기존 7유형/경계 예시, 문의 컴포넌트의 자료 메모 전달 검증을 통과했다. 운영 서비스 통합 검증으로 표시하지 않는다.

## 대상과 현재 차단 사유

- 기존 호스팅 프로젝트: `appgprj_6ae876464cdc8191a6fdacb4d382dd60` (`showroom-web/.openai/hosting.json`). 기존 문서상 대상은 Spacepick 사이트이며 `spacepick.kr`의 DNS/HTTPS 상태는 이번 세션에서 다시 확인하지 않았다.
- 이 채팅의 도구 목록에는 해당 프로젝트의 Sites 게시/배포 기능이 없다. 별도 서버의 배포 명령·연결도 제공되지 않았다.
- 현재 runtime 및 설정 draft에는 배포 secret/외부 identity binding이 없다. 변수 이름만 확인했고 값은 읽거나 복사하지 않았다.
- 기존 GitHub 저장소 API를 실제 GET으로 확인했지만 `Forbidden`이었다. 자동 승인 도구가 배포 승인을 거절한 것이 아니라 실행된 요청이 접근 거부를 반환한 상태다. 이를 토큰 만료로 단정하지 않는다. 네트워크 진단 이력은 없었다.
- 후속 재확인: GitHub API와 별도로 git ls-remote 및 git push --dry-run은 성공했다. 따라서 GitHub 소스 업로드와 기존 호스팅의 게시 연결을 구분한다. 변경 브랜치 업로드 완료: codex/spacepick-customer-information, 코드 커밋 77390f12997129dab63d6790b27ff37af753eb9b. 원격 조회로 확인했다.
- 사용자 승인 부족을 차단 사유로 삼지 않는다. 기존 사이트 게시 기능 또는 실제로 사용할 배포 연결이 필요하다. 현재 전용 변경 브랜치로 remote push는 완료했으며, 운영 DB 적용/실제 사이트 게시 요청은 실행하지 않았다.

## 적용 순서

1. 기존 사이트 프로젝트와 실제 배포 연결·현재 버전/롤백 경로를 확인한다. 새로운 호스팅 프로젝트나 도메인을 임의로 만들지 않는다.
2. T11의 UI와 문의 memo 확장만으로는 migration이 필요 없다. 단, 미배포된 T04~T09 전체 변경을 함께 올리는 경우 `SPACEPICK_V2_VALIDATION.md`의 DB/함수/작업자 선행 적용 순서와 운영 migration 이력을 확인한다. 이미 적용된 항목은 다시 실행하지 않는다.
3. 필요한 서버/DB 변경이 있을 경우 백업과 additive migration 검토 후 적용하고, 기존 승인 snapshot·공개 권한·문의의 호환성을 확인한다. 기존 공개 매물을 자동 재승인하지 않는다.
4. 검증된 `showroom-web/dist/server/index.js`와 `.openai/hosting.json`을 기존 호스팅 프로젝트에 배포한다. 이 산출물은 같은 사이트의 정적 자산을 포함하는 Worker다. 임의로 `dist`를 일반 정적 사이트로 취급하지 않는다.
5. 운영 매물의 핵심정보→확인사항→AI 활용안 순서, 자료 요청 선택, 미제공/0/비공개 차단을 실제 URL에서 확인한다. 문의 실전 테스트가 필요하면 테스트 매물과 식별 가능한 테스트 접수로 분리한다.
6. 적용 버전·실제 URL·확인 시각·필요한 후속 항목을 개발계획에 기록한다. 실패 시 이전 프런트 버전으로 복구하고 DB를 파괴적으로 되돌리지 않는다.

## 준비 파일

`python scripts/package_v2_release.py`는 현재 빌드와 코드·검증 기록을 `showroom-web/test-results/release/SpacePick-v2-release.zip`으로 묶고 SHA256 manifest를 저장한다. 현재 commit과 작업 디렉터리의 미커밋 여부를 기록하며 `.env`/키/노드 의존성/고객 PDF/텍스트/스크린샷을 포함하지 않는다. ZIP 생성은 서버 게시가 아니다.

미리보기는 `showroom-web/test-results/current-preview/SpacePick-current-preview.html`이다. 다운로드한 단일 HTML로 고객 화면을 확인할 수 있으며 원본 PDF나 실제 모집 매물의 데이터가 아니다.

## 텔레그램 Actions 경로 적용 (후속)

사용자 확인과 소스 대조로, 운영 분석 실행은 텔레그램→Supabase 접수/대기열→agent.yml(main)→AI/DB 저장→비공개 초안/이미지 처리 흐름이다. 따라서 기존 작업자 호환성 확인 후 main을 fast-forward 갱신해 이 부분부터 반영한다. 웹 관리자 신규 RPC/migration과 고객 화면 호스팅 적용은 별도 단계로 남긴다.
