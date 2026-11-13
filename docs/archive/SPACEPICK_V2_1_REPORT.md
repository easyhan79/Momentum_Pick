# SpacePick v2.1 완료 보고서

기준: 2026-11-07 한국시간. S0~S6 **로컬 완료**, 운영 배포 **미완료**. 첨부 작업지시서를 기준으로 기존 계획·데이터 계약·코드를 먼저 대조하고 순서대로 진행했다. 개발 브랜치는 `feature/spacepick-v2-1`, 시작 main은 `a35493c90447879d811a1b298b4fe83e8817a1d9`다.

## 단계별 결과

| 단계 | 구현·검증한 결과 | 상태 |
| --- | --- | --- |
| S0 | 기존 구현/누락 매핑, 단계별 계획·원자적 체크포인트, 기준 회귀 | 로컬 완료 |
| S1 | 상가·토지·공장·물류·건물 전체의 고객 목적, 핵심 슬롯/리스크·검토 순서, URL 목적 유지 | 로컬 완료 |
| S2 | 결론→근거/기준일→의미/제약→추가 확인사항의 판단 카드, 근거 상태와 해석 분리, 비공개 기본·관리자 검토·승인 | 로컬 완료 |
| S3 | 목적과 콘셉트 연결, 필수 조건/제약을 기존 생성 입력에 전달, 원본 도면·사진과 승인 AI 활용안 구분 | 로컬 완료 |
| S4 | 공개 매물/목적/콘셉트/확인항목 검증, 문의 메모와 기존 CRM 연결, 승인 버전의 원자적 확인 | 로컬 완료 |
| S5 | 제공자료 규칙 기반 유형별 의미·제약·필요자료, 0/누락/충돌 구분, 제공 층별 렌트롤, 승인시 분석 보고서 동결 | 로컬 완료 |
| S6 | 통합·보안·브라우저·실제 빌드 회귀, 재개 검증, 운영 적용/복구 절차와 배포 패키지 준비 | 로컬 완료 |

## 변경 전후

| 항목 | 시작 시점 | 구현 후 |
| --- | --- | --- |
| 고객 검토 | 유형별 정보/확인 목록 중심 | 목적을 선택하면 조건·리스크·콘셉트 우선순위 변경 |
| 입지·운영 설명 | 제공 조건과 확인 목록을 따로 제시 | 매물의 공개 제공값과 출처·기준일을 연결해 의미·제약·추가 자료를 설명 |
| 자료 비교 | 기존 도면·이미지 기능 | 실제 자료의 유무와 승인 상태에 따라 원본/활용안 구분, 없는 Before를 만들지 않음 |
| 상담 | 자료 요청 메모 | 서버가 확인한 목적·콘셉트·공개 체크 ID/라벨을 기존 CRM에 전달 |
| 분석 보존 | 기존 승인 snapshot 유지 | 신규 분석도 승인 시 동결, 초안 수정·GET 조회가 승인 보고서를 재생성하지 않음 |

캡처는 합성 자료이며 실제 매물의 자료 충실도·시설 재현도를 입증하지 않는다. 시작 시점 예시 `showroom-web/test-results/current-preview/factory-informed-brief.png`와 최종 `showroom-web/test-results/v21-admin-built/public-1440.png`는 서로 다른 합성 자료다. 동일 매물의 정확한 전후 비교로 제시하지 않는다. 다섯 유형·자료 조합별 캡처는 `v21-customer/`, 전문자료 사례는 `v21-professional/`에 보관했다. 산출물은 Git 제외다.

## 검증

- 최종 readiness **35항목 통과**: Python **59개**, Node **141개**, 격리 PostgreSQL **6종**, 프런트 빌드·Edge 타입 검사 포함.
- 브라우저 **64그룹 통과**: 자료 조합+문의/CRM 21, 전문자료 5, 관리자 전체 여정 6, 빌드 전체 여정 6, 기존 예시 8, PDF 7, 임대 가정 6, 문구 편집 5.
- 관리자 신규 등록→분석 대기→근거/목적 수정→비공개 검토→승인→공개 목적/확인 요청→문의 handler→인증된 기존 CRM까지 연결했다. 분석 공급자와 DB 통신은 합성/모의이며 실제 서비스에 요청하지 않았다.
- 375/768/1440px, 목적 URL·새로고침, 네 카드 제목, 자료별 표시, 미공개 원본/수치 제외, 승인 후 초안 수정, 콘솔 오류, 타 매물/ID·revision 조작, 동의·중복·속도 제한·보관·역할 권한을 검사했다.
- 추가 읽기 전용 운영 preflight SQL은 격리 DB에서 실제 객체/함수와 제한 권한 반환을 확인했다. 배포 패키지 232파일의 SQL/함수/Worker/재빌드 입력·문서 포함, 모든 파일 해시 일치와 원본·비밀파일 제외 검사도 통과했다.

명령·개별 실패와 수정·산출물 경로는 [검증 기록](SPACEPICK_V2_1_VALIDATION.md), 작업 단위 시각과 체크포인트는 [PROGRESS](SPACEPICK_V2_1_PROGRESS.md)에 있다. 통과 수는 서로 겹치는 회귀 묶음을 포함하며 독립된 운영 시나리오 수를 의미하지 않는다.

## 코드·데이터 영향

- 주요 화면: `ShowroomPage`, `CustomerPurpose`, `DecisionCards`, `DecisionSettingsEditor`, `BuildingRentRoll`, `VisualEvidence`, 기존 사실정보/콘셉트/문의 편집기.
- 주요 공통/API: `_shared/customer-purpose.ts`, `customer-decision.ts`, `analysis-rules.ts`, `customer-inquiry.ts`, `public-showroom-dto.ts`, 기존 profile/concept 모듈 및 `showroom-admin`, `showroom-inquiries`, `public-showroom`.
- 기존 `analysis_worker.py`/`image_worker.py` 입력 조건을 보강했다. 신규 유료 호출·이미지 슬롯·예산 확대 없음.
- 기존 schema version·slug·ID·revision/CAS·승인본·자료 권한 유지. optional 기준일/설정/보고서·purposeIds 추가. 새 테이블/컬럼 없음.
- additive migration **`20261107010000_customer_inquiry_context.sql` 하나**: 기존 CRM 함수 앞에서 승인 매물/버전을 고정하는 service 전용 RPC. 구버전 요청은 기존 경로 유지. 아직 운영 미적용.
- 정확한 파일 목록은 `git diff --name-only a35493c90447879d811a1b298b4fe83e8817a1d9...feature/spacepick-v2-1`, 매핑은 [GAP_AND_MAPPING](SPACEPICK_V2_1_GAP_AND_MAPPING.md) 참조.

## 운영 적용과 남은 사항

1. 기존 Supabase/호스팅 관리 연결·실제 버전·migration 이력을 확인한 후 [DEPLOYMENT](SPACEPICK_V2_1_DEPLOYMENT.md)의 DB→함수→프런트 적용/복구 순서로 진행한다. 현재 도구로는 해당 관리 작업을 수행할 수 없다. 개발 브랜치 push를 main 병합이나 사이트 배포로 표시하지 않는다.
2. 실제 매물 PDF·사진·도면·계약/인허가를 대조하고 실제 AI 응답을 검수한다. 로컬 합성 테스트는 실제 사실 검증이 아니다.
3. T10b의 상권·인구·시장/규제 API는 별도다. 공급원은 모두 검토 상태이며 자격·비용·재사용·매칭·기준일을 확인한 뒤 연결한다. 현재 기능은 제공자료 기반 1차 검토이고 실제 상권 통계 분석 완료가 아니다.
4. 기존 Telegram 토큰 별칭 수정의 운영 함수 적용·즉시 자동 실행도 별도 미완료다.

배포 준비 파일은 `showroom-web/test-results/release/SpacePick-v2-release.zip`과 `manifest.json`이다. status는 `prepared_not_deployed`, 파일별 SHA256·기준 commit을 포함한다. 해당 산출물은 작업 환경에만 있으며 GitHub에는 소스와 재생성 도구를 저장한다.

## Git 체크포인트

S0 `d88cf11`, S1 `8cc2e55`, S2 `b552355`, S3 `0f8d975`, S4 `11fb945`, S5 `1c5df69`, S6 소스 `296687a`를 개발 브랜치에 순서대로 commit/push했다. 최종 완료 상태/보고 기록은 후속 문서 commit으로 보존한다. main 병합·운영 배포 버전은 없다.

## 재개

[RUN_STATE](SPACEPICK_V2_1_RUN_STATE.json)와 PROGRESS, 실제 `git status`/diff 및 원격 브랜치를 먼저 대조한다. S0~S6를 다시 개발하지 않는다. `lastCommit`/`lastPushedCommit`은 기록 시점에 확인한 소스 체크포인트이며 기록 파일 자체를 저장한 후속 commit은 `git log`로 확인한다. 사용량 복구 시 자동 새 세션 실행 기능은 설치하지 않았다.
