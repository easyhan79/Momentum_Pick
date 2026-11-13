# SpacePick v2.1 요구사항·실제 코드 매핑 (S0)

기준: 2026-11-07 한국시간. 사용자 첨부 v1.1 작업지시서를 원문 기준으로 사용한다. 기준 HEAD a35493c, 초기 git status clean, 원격 main fetch 후 차이 없음. AGENTS.md 없음. 운영 배포와 GitHub 소스 업로드는 별개다.

| 단계/기존 ID | 재사용 근거 | 수정/신규 범위 (UI → API → 저장 → 공개 → 검사) |
| --- | --- | --- |
| S0 / T10c.0 | docs/SPACEPICK_CURRENT_DEVELOPMENT_STATUS.md, SPACEPICK_V2_PLAN.md, DATA_CONTRACT.md, AUDIT.md, VALIDATION.md, EXTERNAL_DATA.md | 감사 문서의 초기 사실정보/등록 미구현 기록은 현재 코드와 불일치. 아래 기존 구현을 재사용하며 반복 개발하지 않음. 루트 RUN_STATE/PROGRESS 및 원자적 체크포인트 도구 추가 |
| S1 / T10c.1 | showroom-web/src/pages/ShowroomPage.tsx; lib/propertyReview.ts, propertyFields.ts; components/CustomerBrief.tsx, PropertyReview.tsx; types/showroom.ts | 목적 UI/URL query 지속·유형별 우선 슬롯 신규. 공개 조회 상태만 변경. 기존 income 호환을 사용해 건물 전체 지원을 최소 확장. 프로필 설정은 기존 draft JSON/CAS 재사용. 목적 전후 순서·분리·모바일 검사 |
| S2 / T10c.2 | supabase/functions/_shared/property-profile.ts의 validateProfile/profileFacts/publicProfileHighlights; public-showroom/index.ts의 publicDto; showroom-admin/index.ts의 저장/검수/CAS | 4단 판단 카드와 기준일/공개 슬롯 ID 신규. 기존 필드 권한·자료 소속·검증을 그대로 재사용. 새 분석은 opt-in/비공개 기본, 승인 후 공개 허용 목록에 투영. 신규 테이블 불필요. 기존 snapshot/비공개/0/미입력 검사 |
| S3 / T10c.3 | ConceptsEditor.tsx, PlanEditor.tsx, ZoneMap.tsx, ImageStudio.tsx; _shared/concept-edits.ts, image-settings.ts; image_worker.py | 승인 콘셉트의 목적 연결·순서/표현 보완. 사진·도면·개념형 조합 안내. 새 AI 작업을 추가하지 않고 기존 ID/예산/참조 무효화 사용. 자료 조합/승인/오래된 참조 회귀 검사 |
| S4 / T10c.4 | LiveInquiry.tsx, RequestedMaterials.tsx, lib/customerReview.ts; showroom-inquiries/index.ts, _shared/inquiries.ts; showroom-crm/index.ts, CrmWorkspace.tsx; 기존 crm_register_inquiry RPC/동의/스팸/중복 처리 | 기존 문의 메모에 서버가 검증·정규화한 목적/매물/콘셉트/공개 확인항목 문맥을 연결하는 호환 경로 우선. 고객이 보낸 비공개 fact ID/타 매물/임의 라벨은 거절. 새 영구 필드 없이 기존 memo 재사용. 승인 property/revision을 원자적으로 고정하는 service 전용 RPC 하나 추가(20261107010000). 기존 요청 계약·CRM 유지 |
| S5 / T10c.5 | 기존 propertyProfile, document-review.ts, rental-scenario.ts 및 출처/공개 권한; analysis_worker.py의 제한된 AI 호출/복구 | 검토 규칙 기반 제공자료 분석 초안과 관리자 검토 흐름 신규. 5유형 조건별 확인/검토/미확인, 충돌/누락/민감정보 보호. 외부 사실/점수/확정수익 생성 금지. 근거 바뀌면 승인된 분석을 재사용하지 않음. 실제 AI 호출 없이 검증 가능한 경로부터 구현 |
| S6 / T10c.6 및 T12 준비 | scripts/check_v2_readiness.py; supabase/tests; tests; showroom-web/scripts/property-facts-qa.cjs와 built-assets/Worker 검사 | 기존 검사 유지·확장. 5유형×4자료 조합, 관리자→승인→고객→문의/CRM E2E. 로컬/운영 미검증 분리, 배포 순서·복구·재개 문서 |

## 데이터/안전성 결정

- Showroom.schema_version 1.0, propertyProfile.version 1, 기존 Fact 키·concept/zone ID·slug 유지.
- 기존 private/approved, sourcePermissions, 검증 기록과 공개 승인 분리 유지. 과거 verified 표시를 새 증빙 확인으로 승격하지 않음.
- 우선 기존 JSON draft 및 CAS/승인 snapshot을 확장한다. 기존 운영 DB를 변경하지 않으며 관계형 추가가 필요해질 때만 additive migration을 작성·격리 검증한다.
- 새 목적 선택은 방문자 URL/local state일 뿐 DB 쓰기가 아니다. 고객에게 private profile 전체나 원본 ID/파일 경로를 보내지 않는다.
- 기존 문의의 동의·개인정보 보관·서버 중복/속도 제한·알림 방식 유지. 선택한 공개 확인항목 문맥을 기존 CRM에 연결한다.
- S0~S6는 외부 상권 API 계약 없이 진행한다. T10b는 기존 문서에 공급원 상태만 정리하며 실제 운영 연결·결제·외부 설정을 하지 않는다.

## 현재 외부 미검증

운영 호스팅/Supabase 관리 연결 없음. 새 main 실제 AI 호출·실매물 사실 대조·실제 운영 migration/배포 검증 없음. 사용자 제안서 원본은 제품 원리 참고 자료이며 다른 매물에 수치/계약/사진을 전용하지 않는다.

## 체크포인트

scripts/v21_checkpoint.py가 RUN_STATE(JSON)와 PROGRESS(Markdown)를 각각 임시 파일 후 원자적으로 교체한다. 작업 단위마다 즉시 기록하고, 로컬 합격 단계만 다음 단계로 진행한다. 예고 없이 한도가 끝나면 in_progress 기록과 git diff부터 재개한다.
