# SpacePick v2.1 연속 개발 기록

## 2026-11-07T00:39:15.831479+09:00 — S0 시작

- 기준 작업지시서를 루트에 원문 보관. 사용자 승인: S0~S6 자동 연속 진행, 단계별 체크포인트.
- 시작 브랜치: `fix/customer-copy-review`, HEAD `a35493c90447879d811a1b298b4fe83e8817a1d9`. 작업 전 미커밋 변경 없음.
- 기존 원격 추적 main과 diff 없음. git log -5 확인. 최신 원격 조회는 다음 네트워크 단계에서 재확인.
- 기존 상태/계획/감사/데이터 계약/검증/외부 데이터 문서와 실제 코드 조사 중. 초기 감사의 미구현 기록은 현재 코드와 다르므로 재사용 위치를 직접 대조.
- 운영 데이터·승인본 변경, 운영 배포, 외부 서비스 설정 변경 없음.
- 다음: S0 매핑 문서 작성 및 현재 계획의 하위 단계 연결.

## 2026-11-07T00:40:18.722643+09:00 — S0 / in_progress

- 변경/완료 상태: 기존 코드/저장/공개/문의 경로 매핑 작성; 원격 main과 차이 없음; 작업지시서 원문 보관
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / a35493c90447879d811a1b298b4fe83e8817a1d9; v2.1 운영 배포 없음.
- 다음: 기준 회귀 검사 결과 확인 후 S0 완료 커밋; S1 시작

## 2026-11-07T00:41:04.793871+09:00 — S0 / local_complete

- 변경/완료 상태: 요구사항별 UI/API/저장/공개/검사 매핑과 단계/운영 경계 확정; baseline 25항목 통과
- 검증: PGLITE_MODULE=/workspace/spacepick-test-tools/node_modules/@electric-sql/pglite/dist/index.js python scripts/check_v2_readiness.py (25/25 passed)
- Git: feature/spacepick-v2-1 / a35493c90447879d811a1b298b4fe83e8817a1d9; v2.1 운영 배포 없음.
- 다음: S1 목적 선택 및 유형별 우선 슬롯 구현

## 2026-11-07T00:41:19.095708+09:00 — S1 / in_progress

- 변경/완료 상태: S0 로컬 커밋 완료; 기존 유형/프로필/검토 영역 재사용
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / d88cf11a8575b36d45c7acba90709ea4ab2bfd14; v2.1 운영 배포 없음.
- 다음: 유형별 목적 카탈로그·URL 상태·우선 슬롯 구현 및 S1 검증

## 2026-11-07T00:42:57.066950+09:00 — S1 / in_progress

- 변경/완료 상태: 공유 목적/공개 슬롯 카탈로그, URL 목적 지속, 목적별 핵심정보·리스크·검토순서 구현; 기존 income을 건물 전체로 최소 확장
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / d88cf11a8575b36d45c7acba90709ea4ab2bfd14; v2.1 운영 배포 없음.
- 다음: S1 빌드/단위·모바일 목적 전환 검사; 건물 슬롯 보강

## 2026-11-07T00:44:14.480566+09:00 — S1 / in_progress

- 변경/완료 상태: 건물 전체 income 편집·슬롯 보강; 목적별 순서·0/누락·유형 분리 단위 검사 4개 및 프런트 타입 통과
- 검증: node supabase/tests/customer-purpose.test.ts; pnpm --dir showroom-web run typecheck
- Git: feature/spacepick-v2-1 / d88cf11a8575b36d45c7acba90709ea4ab2bfd14; v2.1 운영 배포 없음.
- 다음: S1 5유형 목적/URL/375·768·1440 브라우저 검증 후 완료

## 2026-11-07T00:45:59.139436+09:00 — S1 / local_complete

- 변경/완료 상태: 목적·URL 지속·핵심 슬롯/리스크/검토 순서와 income 건물 지원 완료; 목적 4개·프로필 7개·등록 4개 회귀, 빌드, 5유형 브라우저/375·768·1440 통과
- 검증: node supabase/tests/customer-purpose.test.ts; node supabase/tests/property-profile.test.ts; node supabase/tests/web-registration-api.test.ts; pnpm --dir showroom-web run build; scripts/v21-customer-qa.cjs (5 groups passed)
- Git: feature/spacepick-v2-1 / d88cf11a8575b36d45c7acba90709ea4ab2bfd14; v2.1 운영 배포 없음.
- 다음: S1 로컬 커밋 후 S2 4단 판단 카드·공개 계약 구현

## 2026-11-07T00:46:13.844268+09:00 — S2 / in_progress

- 변경/완료 상태: S1 완료 커밋; 기존 profile 공개 권한과 검증 기록을 재사용
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 8cc2e558fdb61b6bdd6572a4e576f705a4337d17; v2.1 운영 배포 없음.
- 다음: 4단 판단 카드 DTO·기준일·비공개/승인 경계 구현과 검사

## 2026-11-07T00:48:38.724401+09:00 — S2 / in_progress

- 변경/완료 상태: 4단 판단 DTO/UI, 정보 기준일, 5상태 문구, opt-in 비공개 기본·서버 검토 승인·공개 필터 구현
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 8cc2e558fdb61b6bdd6572a4e576f705a4337d17; v2.1 운영 배포 없음.
- 다음: S2 판단 카드 설정 관리자 UI와 비공개/충돌/0/미입력/승인본 회귀 검사

## 2026-11-07T00:50:13.989328+09:00 — S2 / in_progress

- 변경/완료 상태: 관리자 판단 카드 준비·목적 표시명 편집·검토 확인·공개 범위 UI 연결; PDF/필드 변경시 검토 무효화; 신규 보안 검사 5개 통과
- 검증: node supabase/tests/customer-decision.test.ts; pnpm --dir showroom-web run typecheck
- Git: feature/spacepick-v2-1 / 8cc2e558fdb61b6bdd6572a4e576f705a4337d17; v2.1 운영 배포 없음.
- 다음: S2 기존 회귀 및 카드 브라우저/공개 DTO 검사 후 완료

## 2026-11-07T00:51:01.295958+09:00 — S2 / in_progress

- 변경/완료 상태: 판단 카드 비공개/근거 변경 무효화·명시적 검토 해제·5상태 UI 적용; 기존 프로필/승인/문서 회귀 통과
- 검증: customer-decision/property-profile/admin-api/public-showroom/document-review tests; frontend build
- Git: feature/spacepick-v2-1 / 8cc2e558fdb61b6bdd6572a4e576f705a4337d17; v2.1 운영 배포 없음.
- 다음: S2 공개 카드 기준일·4단계 브라우저 확인 후 완료 커밋

## 2026-11-07T00:52:48.464117+09:00 — S2 / local_complete

- 변경/완료 상태: 4단 카드·기준일·상태·목적 설정 편집·검토/공개 분리 완료; 신규 6개와 기존 42개 및 빌드/5유형 브라우저 통과
- 검증: customer-decision 6; profile 7; admin 21; public 7; document 7; build; v21-customer-qa 5 kinds/3 widths
- Git: feature/spacepick-v2-1 / 8cc2e558fdb61b6bdd6572a4e576f705a4337d17; v2.1 운영 배포 없음.
- 다음: S2 커밋 후 S3 목적별 콘셉트 연결 및 자료 표현 구현

## 2026-11-07T00:53:00.074559+09:00 — S3 / in_progress

- 변경/완료 상태: S2 안전성/공개 계약 완료; 기존 concept/zone/image ID·예산 보호 재사용
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: 콘셉트 목적 연결·자료 조합별 비교·생성 조건과 오래된 이미지 회귀 구현

## 2026-11-07T00:55:00.594311+09:00 — S3 / in_progress

- 변경/완료 상태: 콘셉트 목적 연결/서버 허용 ID/공개 필터·이미지 무효화 서명, 자료 조합별 비교, 목적 필수조건 생성 입력 구현; 기존 콘셉트 2개·타입 검사 통과
- 검증: node supabase/tests/concept-edits.test.ts; pnpm --dir showroom-web run typecheck
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: S3 목적/이미지 비용 보호·자료 조합 회귀 및 브라우저 검증

## 2026-11-07T00:56:03.277368+09:00 — S3 / in_progress

- 변경/완료 상태: 목적 연결 순서를 집합으로 정규화해 불필요한 이미지 재생성 방지; 서버 목적조건·원본/AI 구분 검증 추가; 이미지 worker 회귀 통과
- 검증: concept-edits 3; unittest tests.test_image_worker; frontend typecheck
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: S3 5유형×4자료 조합 브라우저·SQL 이미지 보호 검사

## 2026-11-07T00:56:56.658511+09:00 — S3 / blocked_test

- 변경/완료 상태: 브라우저 초기 실패: 탭 접근성 이름에 CONCEPT 번호가 포함되어 exact-name 선택자 불일치. 구현의 안정된 탭 ID로 테스트 선택자 수정; SQL 이미지/예산/승인본 보호 검사 통과
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: 수정된 S3 20조합 브라우저 재실행; 합격 전 S4 진행 금지

## 2026-11-07T00:58:27.076479+09:00 — S3 / blocked_test

- 변경/완료 상태: 20조합 중 19개 통과 후 검사 중 소스 수정으로 Vite HMR이 마지막 실행 문맥을 종료함; 제품 통과로 표시하지 않음. 이제 소스 변경 중단 후 전체 재검사
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: V21_MATERIAL_QA=1 browser 20/20 통과 후에만 S3 완료; 이후 S4 시작

## 2026-11-07T01:00:49.562515+09:00 — S3 / local_complete

- 변경/완료 상태: 목적-콘셉트 연결·필수조건 입력·원본/AI 비교 완료; 20/20 조합과 단위/SQL/비용 보호 회귀 통과; 실패 원인·재실행 기록 보존
- 검증: 20/20 v21 browser; concept 3/plan 4/image-setting 1/visual 1/image worker 11; concept-images SQL; build/Edge typecheck
- Git: feature/spacepick-v2-1 / b552355bd62411eec629c2182dcb87cfb76d6926; v2.1 운영 배포 없음.
- 다음: S3 커밋 후 S4 공개 확인항목/목적/콘셉트의 문의·CRM 서버 검증 구현

## 2026-11-07T01:01:16.181232+09:00 — S4 / in_progress

- 변경/완료 상태: S3 로컬 완료 커밋; 기존 문의/CRM/동의/중복·속도 제한 재사용
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 공개 승인본 기준 문맥 검증·문의 연결 및 승인 revision 고정 RPC 설계/구현

## 2026-11-07T01:02:35.993231+09:00 — S4 / in_progress

- 변경/완료 상태: 공개 DTO를 부작용 없는 공유 모듈로 분리하고 승인 snapshot 기준 문의 문맥 검증 추가. 기존 CRM 메모/보관/알림/제한 재사용. 승인 버전 경쟁을 막는 추가 RPC migration을 로컬 작성
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: S4 고객 선택 UI·API/CRM·격리 SQL 검증 구현

## 2026-11-07T01:04:30.297403+09:00 — S4 / blocked_test

- 변경/완료 상태: S4 프런트 타입 검사에서 문의 문맥의 배열 거절 분기 때문에 TypeScript가 Record/배열 union으로 좁히는 오류 확인; 저장/운영 요청 없음
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 입력 객체/배열 검증을 캐스팅 이전으로 옮기고 타입 및 기존 API 회귀 재검사

## 2026-11-07T01:04:34.410330+09:00 — S4 / in_progress

- 변경/완료 상태: 타입 오류 수정 후 프런트 타입·기존 문의 7/공개 7 회귀 통과; S4 구현 계속
- 검증: frontend typecheck; inquiry-api 7; public-showroom 7
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 새 문의 문맥 변조/중복·SQL revision 고정 검사

## 2026-11-07T01:06:56.740491+09:00 — S4 / in_progress

- 변경/완료 상태: 공개 문맥 API 신규 5개와 기존 문의/공개 회귀 통과; S4 공개 선택→실제 handler→CRM 브라우저 시나리오 추가
- 검증: customer-inquiry 5; frontend typecheck
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 격리 SQL 결과 및 S4 브라우저 확인 후 완료

## 2026-11-07T01:07:29.455353+09:00 — S4 / blocked_test

- 변경/완료 상태: 격리 SQL fixture의 published_content가 빈 객체여서 기존 승인 snapshot 보호 제약에 걸림. 제약을 풀지 않고 유효한 합성 승인본으로 fixture 수정; API 5개는 통과
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 수정 SQL fixture로 동일 migration·중복/버전/보관/권한 검사 재실행

## 2026-11-07T01:08:47.276610+09:00 — S4 / in_progress

- 변경/완료 상태: 공개 선택→실제 문의 handler→인증된 기존 CRM 브라우저 통과; 익명 CRM 차단. Edge 타입 및 빌드 통과
- 검증: V21_INQUIRY_QA browser 6 groups; Edge typecheck; frontend build
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: 격리 SQL 최종 결과 확인 후 S4 완료 커밋

## 2026-11-07T01:09:43.304864+09:00 — S4 / local_complete

- 변경/완료 상태: 공개 ID/라벨·매물/목적/콘셉트 검증과 기존 CRM 연결 완료; 신규/기존 API, 6그룹 브라우저, 격리 SQL·보관/역할/중복·revision 통과
- 검증: customer-inquiry 5; inquiry-api 7; public 7; browser 6 groups; customer-inquiry SQL; build/Edge typecheck
- Git: feature/spacepick-v2-1 / 0f8d975f67188643f90059f26d347c8c913edd0a; v2.1 운영 배포 없음.
- 다음: S4 커밋 후 S5 제공자료 분석 품질 규칙과 건물 제공 렌트롤 구현

## 2026-11-07T01:10:33.986917+09:00 — S5 / in_progress

- 변경/완료 상태: S0~S4 체크포인트를 feature/spacepick-v2-1에 업로드 확인; 운영 main/서비스 변경 없음. S5 규칙 기반 제공자료 분석 시작
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: 5유형 조건별 판단·중요 누락/충돌·렌트롤·수익/법정 한계 품질 규칙 구현

## 2026-11-07T01:14:23.281616+09:00 — S5 / in_progress

- 변경/완료 상태: 유형/항목별 의미·필요자료·0/충돌·인허가/수익 한계 규칙 추가. 판단문은 자료 기반 해석으로 분리하고 승인 시 보고서 동결; 실제 제공 렌트롤만 표시
- 검증: customer-decision tests; frontend typecheck
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: 5유형 누락/충돌/민감정보·승인 보고서 불변·실제 원문/PDF 연결 품질 검증

## 2026-11-07T01:16:41.233389+09:00 — S5 / blocked_test

- 변경/완료 상태: 품질 검사에서 경고문 확정 수익률이 아님을 긍정 주장으로 오인한 정규식 실패. 실제 결론의 단정 여부와 부정형 한계 고지를 분리해 검사하도록 수정
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: 품질 6개 재검사 및 실제 JSONB 왕복·동결 snapshot 보존 검사

## 2026-11-07T01:16:46.609056+09:00 — S5 / in_progress

- 변경/완료 상태: 품질 6개·판단 계약 6개·실제 JSONB 왕복과 승인 snapshot 불변 검사 통과; 한계 경고문과 긍정 주장을 분리 검사
- 검증: analysis-quality 6; customer-decision 6; frontend typecheck; analysis-snapshot-db
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: 관리자 입력/근거 대조→분석 확인/승인→고객→CRM E2E 후 S5 완료

## 2026-11-07T01:20:34.797834+09:00 — S5 / in_progress

- 변경/완료 상태: 실제 관리자 handler의 검토→게시 보고서 동결 및 이후 초안 변경/검토 무효화 검증 통과. 공개 GET은 새로 분석하지 않고 승인 보고서만 허용; 가정 계산은 기존 모듈 링크로 분리
- 검증: analysis-quality 7; frontend typecheck
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: S5 전체 관련 회귀·타입·빌드 후 완료; S6 20조합·관리자 등록→CRM E2E와 운영 준비

## 2026-11-07T01:21:52.196891+09:00 — S5 / in_progress

- 변경/완료 상태: 5유형 모두 입력/누락/충돌/비공개를 검증했고 관리자 publish 이후 분석 보고서와 공개본 보존을 확인. 기존 사실정보/문서/문의 회귀와 빌드 통과
- 검증: analysis-quality 7 (five-kind matrix); profile 7; admin 21; document 7; customer-inquiry 5; build
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: S5 체크포인트 완료 후 S6 전체 QA/재개 안정성/운영 적용 준비

## 2026-11-07T01:23:13.692054+09:00 — S5 / local_complete

- 변경/완료 상태: 유형별 의미/제약/필요자료·5상태/조건 판단·부분 렌트롤·가정 계산 분리 완료. 실제 JSONB 및 관리자 승인/초안변경 불변 검증 통과; 유료 AI 호출 없음
- 검증: analysis-quality 7; customer-decision 6; analysis-snapshot-db; related 40 regressions; build/typecheck
- Git: feature/spacepick-v2-1 / 11fb94525f22748d3ed9a98e811a318c2c63ee50; v2.1 운영 배포 없음.
- 다음: S5 커밋 후 S6 전체 회귀·20자료 조합·신규 등록부터 CRM E2E·운영 준비 문서화

## 2026-11-07T01:23:48.980038+09:00 — S6 / in_progress

- 변경/완료 상태: S0~S5 로컬 완료. S6 전체 회귀/재개 파일 안정성/20자료 조합/등록부터CRM E2E·운영 적용 준비 시작
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 검사 도구에 v2.1 전체 스위트 등록, 관리자 여정 브라우저, 배포/복구/외부 미검증 문서화

## 2026-11-07T01:25:05.771902+09:00 — S6 / in_progress

- 변경/완료 상태: 회귀 도구에 v2.1 및 기존 문의/접수/SQL 보호 검사를 추가. 원자 저장·명시적 한도 중단/재개·실패 시 이전 상태 보존 테스트 4개 통과
- 검증: python -m unittest tests.test_v21_checkpoint (4 passed)
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 전체 readiness 및 관리자 신규 등록→분석 검토/승인→고객 확인요청→CRM E2E

## 2026-11-07T01:29:03.562142+09:00 — S6 / blocked_test

- 변경/완료 상태: 전체 readiness 35/35 통과. 관리자 E2E는 새 판단 카드 공개 범위 select의 정확한 라벨 탐색에서 중단; 실제 HTML/접근성 점검 중
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 명시적 select 라벨 보완 후 관리자 등록→승인→CRM 여정 재검사

## 2026-11-07T01:29:40.563143+09:00 — S6 / in_progress

- 변경/완료 상태: 실제 HTML에 select는 있었으나 implicit label에 option 텍스트가 섞여 exact label 탐색 실패. 명시적 aria-label·fieldset legend를 추가했고 타입 검사 통과
- 검증: frontend typecheck
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 수정된 관리자 E2E 재실행; 전체 20조합·기존 PDF/가정·문구/권한 브라우저 회귀

## 2026-11-07T01:33:31.677210+09:00 — S6 / blocked_test

- 변경/완료 상태: 등록→검토/승인→공개 요청→CRM 기능 시나리오는 통과했으나 콘솔에서 실제 중복 React key 발견. CustomerPurpose와 기존 ScenarioCalculator가 main의 형제로 data.id 키를 공유
- 검증: 이 체크포인트에서 새 검증 없음
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 목적 컴포넌트 키를 구분하고 v21 모든 유형에도 콘솔 중복 키 검사를 추가하여 재검사

## 2026-11-07T01:33:38.511571+09:00 — S6 / in_progress

- 변경/완료 상태: 목적 UI 키를 purpose-{propertyId}로 구분하고 콘솔 중복 경고를 모든 유형 브라우저에서 감지. 수정 후 빌드 통과
- 검증: frontend build after unique-key/accessibility fixes
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 관리자 전체 여정과 20자료 조합 재검사; 기존 PDF/임대 가정/문구 회귀

## 2026-11-07T01:35:34.990875+09:00 — S6 / in_progress

- 변경/완료 상태: 체크포인트마다 실제 수정 파일 목록을 JSON/PROGRESS에 자동 기록하도록 보강; 원자 저장/복구 4개 재검증 통과. 최종 브라우저·기존 기능 회귀 진행 중
- 검증: python -m unittest tests.test_v21_checkpoint (4 passed)
- 변경 파일: SPACEPICK_V2_1_PROGRESS.md, SPACEPICK_V2_1_RUN_STATE.json, scripts/check_v2_readiness.py, scripts/package_v2_release.py, scripts/v21_checkpoint.py, showroom-web/scripts/property-facts-qa.cjs, showroom-web/scripts/v21-customer-qa.cjs, showroom-web/src/components/DecisionSettingsEditor.tsx, showroom-web/src/pages/ShowroomPage.tsx, SPACEPICK_V2_1_DEPLOYMENT.md, supabase/review/v21_preflight.sql, tests/test_v21_checkpoint.py
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 관리자/20조합 결과 확인, PDF·임대 가정·문구/기존 7예시 브라우저 확인

## 2026-11-07T01:39:34.283118+09:00 — S6 / in_progress

- 변경/완료 상태: 관리자 전체 여정 6그룹, 20자료 조합+문의 21그룹, PDF 7그룹, 임대 가정 6그룹 통과. 5유형 전문자료·원문 비공개 사례를 추가하여 마지막 검증 중
- 검증: V21_ADMIN_QA 6 groups; V21_MATERIAL_QA+V21_INQUIRY_QA 21 groups; PDF 7; rental 6
- 변경 파일: SPACEPICK_V2_1_PROGRESS.md, SPACEPICK_V2_1_RUN_STATE.json, scripts/check_v2_readiness.py, scripts/package_v2_release.py, scripts/v21_checkpoint.py, showroom-web/scripts/property-facts-qa.cjs, showroom-web/scripts/v21-customer-qa.cjs, showroom-web/src/components/DecisionSettingsEditor.tsx, showroom-web/src/pages/ShowroomPage.tsx, SPACEPICK_V2_1_DEPLOYMENT.md, supabase/review/v21_preflight.sql, tests/test_v21_checkpoint.py
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 전문자료 5유형/기존 예시7종/문구 편집 회귀, 최종 상태·배포 패키지 저장

## 2026-11-07T01:44:28.888475+09:00 — S6 / in_progress

- 변경/완료 상태: 전문자료 5유형 5그룹·기존 예시 8그룹·문구 편집 5그룹 통과; 최종 통합 35항목 통과. 배포 패키지의 기존 SQL 누락을 발견해 포함 범위를 수정
- 검증: 35 readiness passed; professional 5; existing showroom 8; copy 5
- 변경 파일: SPACEPICK_V2_1_PROGRESS.md, SPACEPICK_V2_1_RUN_STATE.json, scripts/check_v2_readiness.py, scripts/package_v2_release.py, scripts/v21_checkpoint.py, showroom-web/scripts/property-facts-qa.cjs, showroom-web/scripts/v21-customer-qa.cjs, showroom-web/src/components/DecisionSettingsEditor.tsx, showroom-web/src/pages/ShowroomPage.tsx, SPACEPICK_V2_1_DEPLOYMENT.md, supabase/review/v21_preflight.sql, tests/test_v21_checkpoint.py
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: 빌드 전체여정·읽기 전용 preflight 확인 후 최종 계획/보고서·패키지·원격 체크포인트 확정

## 2026-11-07T01:48:28.070102+09:00 — S6 / local_complete

- 변경/완료 상태: S6 통합35/Python59/Node141/SQL6와 브라우저64그룹 통과; preflight SQL 격리검사·패키지 SQL/문서/해시 확인, 완료/외부 대기 계획 갱신
- 검증: readiness35 + browser64 + read-only preflight + release hashes passed
- 변경 파일: README.md, SPACEPICK_V2_1_GAP_AND_MAPPING.md, SPACEPICK_V2_1_PROGRESS.md, SPACEPICK_V2_1_RUN_STATE.json, SPACEPICK_V2_1_VALIDATION.md, docs/SPACEPICK_CURRENT_DEVELOPMENT_STATUS.md, docs/SPACEPICK_V2_EXTERNAL_DATA.md, docs/SPACEPICK_V2_PLAN.md, scripts/check_v2_readiness.py, scripts/package_v2_release.py, scripts/v21_checkpoint.py, showroom-web/scripts/property-facts-qa.cjs, showroom-web/scripts/v21-customer-qa.cjs, showroom-web/src/components/DecisionSettingsEditor.tsx, showroom-web/src/pages/ShowroomPage.tsx, supabase/tests/customer-inquiry-db.test.mjs, SPACEPICK_V2_1_DEPLOYMENT.md, SPACEPICK_V2_1_REPORT.md, supabase/review/v21_preflight.sql, tests/test_v21_checkpoint.py
- Git: feature/spacepick-v2-1 / 1c5df69bf163f987fa94d6b73703f930839db436; v2.1 운영 배포 없음.
- 다음: S6 소스 체크포인트 commit/push, all_local_complete 기록 후 깨끗한 배포 준비 zip 재생성

## 2026-11-07T01:49:23.669428+09:00 — S6 / all_local_complete

- 변경/완료 상태: S0~S6 구현/회귀/문서화 완료. S6 소스 296687a 개발 브랜치 push 성공; 통합35·브라우저64·preflight·깨끗한 소스 패키지232파일/해시/공개입력 검사 통과. 운영 main/DB/함수/호스팅 미변경
- 검증: readiness35 (Python59 Node141 SQL6); browser64; preflight; clean release232 hashes/inputs
- 변경 파일: 없음
- Git: feature/spacepick-v2-1 / 296687a984eb4a1f11a4fa8b56eaaf8104fdbcb9; v2.1 운영 배포 없음.
- 다음: S0~S6 재개발 없음. 관리 연결·운영 버전 확인 후 DEPLOYMENT의 적용/복구 절차와 실매물·실제 AI 검증; T10b 별도

## 2026-11-07T07:43:22.190336+09:00 — 후속 PRIVATE_PREVIEW / P0 blocked_external

- 사용자 지시: 개발 중 본인만 볼 수 있는 배포 환경을 연결하여 실제 화면도 확인.
- 완료: 기존 hosting 프로젝트/Worker·관리자 로그인/비공개 미리보기 재확인. adminApi/router의 운영 Supabase 고정 확인. 본인 제한·테스트 데이터/API 분리와 P0~P6 계획 저장.
- 검증: runtime running/current; restricted network enforced; 배포 secret/identity binding 없음. 도구 검색에서 hosting/Supabase 관리 기능 없음. 코드·문서 읽기 및 diff 검토만 수행; 이번 변경은 문서/상태이며 기능 테스트·운영 요청 없음.
- Git 기록 시점: 1315058adf8b0c9cc92cb4e61a463167907d349e; 개발 브랜치에 문서/상태 저장 예정. 실제 코드 변경·운영 main 병합·DB/함수/사이트 배포 없음.
- 다음: 기존 사이트 게시/관리 기능이 연결된 작업 화면과 Supabase 관리 연결 확보 후 P0부터 확인. S0~S6 all_local_complete 유지; 새 비공개 배포는 미완료.

## 2026-11-07T07:52:44.213982+09:00 — COPY_REWRITE / R0 완료·R1 진행

- 기존 최초 분석·광고 편집·승인본/CAS 보호를 확인. 등록 매물의 선택 문안만 새 비공개 결과로 작성하고 비교/선택 적용하는 경로 개발 시작.
- 범위: 제목/요약/블로그2종/카드뉴스, 작성 방향, 큐/제한/오류 복구, 명시적 적용/폐기. 이미지·콘셉트·운영 승인본 보호.
- 다음: 큐/worker/API 후 UI 및 합성 회귀. 실제 AI/운영 요청 없음.

## 2026-11-07T08:01:32.860889+09:00 — COPY_REWRITE / R1 완료·R2/R3 진행

- 별도 private 큐/3회 재시도·시간당 3요청·동일 요청 멱등·동결 원문·revision 적용, 전용 workflow/worker·관리자 API·비교 UI 구현. 기본 비활성화, 추가 migration/배포 전에는 실행되지 않음.
- 검증: Python 6개, API 5개, 격리 SQL 큐/적용/취소/lease/속도/권한/승인본·이미지·원본 보존 통과. build 통과. SQL CASE 비교 구문의 괄호 누락을 격리 검사에서 발견·수정 후 전체 해당 SQL 통과.
- 다음: 실제 브라우저/기존 광고 편집·관리 흐름 회귀. 실제 AI·운영 요청/설정 변경 없음.

## 2026-11-07T08:10:45.559952+09:00 — COPY_REWRITE / R0~R3 local_complete

- 등록 매물의 다시 글작성 버튼, 선택 문안/방향, 비공개 큐·완료 비교·명시 적용/폐기, 새로고침 요청 복원과 미저장 광고/쇼룸 보호 구현 완료. SQL·전용 worker/workflow·API 기본 비활성화/권한·중복/속도/lease 보호, 운영 적용 문서 저장.
- 검증: 통합37항목 (Python65/Node146/SQL7/build/Edge타입), 최종 별도 build, 브라우저21그룹 (신규5+빌드5+기존문구5+관리전체6) 통과.
- 실패/수정: SQL CASE 괄호, 로컬 서버 미실행, 검사 버튼 선택자, 진행 중 새로고침 후 선택 항목 복원 문제를 수정·재검증. CSS 확인 후 최종 빌드/실제 Worker 5그룹 통과.
- 보존: 기존 properties.ai_contents/승인 snapshot/이미지·콘셉트·사실정보 불변, 미저장/새 revision 덮어쓰기 및 늦은 worker 결과 차단.
- 외부 미완료: 실제 AI·운영 migration/dispatch/workflow·관리함수·프런트/활성화. 실제 호출·운영 배포/설정 변경 없음.
- 다음: 검증 소스/기록을 기존 개발 브랜치에 commit/push하고 배포 준비 패키지 갱신. 운영 적용 순서는 docs/COPY_REWRITE.md.

## 2026-11-07T08:12:20.130139+09:00 — COPY_REWRITE / GitHub·패키지 확인

- 소스 체크포인트 9b455002b51152684919c17b6ddc5f9e83c374c3를 feature/spacepick-v2-1에 push 성공. 재작성의 계획/구현/검증 기록도 포함. main 병합·운영 변경 없음.
- 깨끗한 소스로 배포 준비 244파일 생성, worker/workflow/추가 SQL·두 후속 계획·사용법 포함·모든 파일 SHA256·PDF/첨부/환경파일 제외 검사 통과. prepared_not_deployed. 최종 기록 commit 후 패키지만 다시 생성한다.
- 다음: docs/COPY_REWRITE.md의 배포/활성화 및 실제 AI 결과 검증. 이번 기능은 로컬 완료이며 현재 운영 화면에서 사용 가능하다고 표시하지 않는다.

## 2026-11-07T08:20:07.979260+09:00 — IMAGE_PROMPTS / IP0 완료·IP1 진행

- 사용자 요청에 따라 검토실에서 대표/콘셉트별 Gemini 웹용 생성·수정 프롬프트를 준비. 기존 image_worker의 모드/구역/가설/원본 보존 규칙과 관리자 자료 선택/권한 흐름 확인.
- 범위: 현재 편집값으로 추가 AI 호출 없이 텍스트 구성·수정 방향·복사/다운로드. 실제 원본 권한·매물 소속, 비공개 수치/연락처/원본 경로 제외. DB/이미지 작업/운영 변경 없음.
- 다음: 패널·순수 프롬프트 구성 함수 및 유형/권한/UI 회귀 검증.

## 2026-11-07T08:26:08.444050+09:00 — IMAGE_PROMPTS / IP1·IP2 완료·IP3 진행

- 기존 이미지 방식 패널 안에 Gemini 웹용 대표/콘셉트·신규/수정·방향·복사/텍스트 내려받기를 구현. 현재 편집값을 반영하며 원본 선택/권한 없이는 참고 이미지 프롬프트 사용 차단. 공개 허용 제공값만 사용하고 수치0/구역/원본 보존·가설을 명시.
- 검증: 신규 규칙6개·통합38항목(Node152/Python65/SQL7/build/Edge타입) 및 개발 브라우저4그룹 통과. 실제 클립보드/다운로드, 모바일375/768/1440, 원본/권한 전환·비공개 제외·저장본/승인본 보존 검사.
- 다음: 최종 Worker/기존 관리자 브라우저 회귀·사용법/상태·소스 업로드. 기존 개발 서버가 살아 있어 새 시작은 포트 사용 중으로 종료됐고 기존 서버로 검증함. 실제 이미지·AI·운영 요청 없음.

## 2026-11-07T08:28:31.122763+09:00 — IMAGE_PROMPTS / IP0~IP3 local_complete

- Gemini 웹용 대표/콘셉트별 생성/수정·표현 방향·복사/파일 내려받기 완료. 기존 source 권한·유형·구역·가설/구조 보존 규칙을 반영. source IDs/원본 경로·주소/연락처/비공개·미확인·AI 가설값 제외. 현재 관리자 편집값 반영, 실제 저장/이미지 생성·예산·게시 없음.
- 검증: 신규 순수 규칙6개, 통합38항목(Python65 Node152 SQL7 build/Edge타입), 브라우저14그룹(개발4+빌드4+기존 관리자6) 통과. clipboard/UTF-8 다운로드 문안 일치·원본/권한 전환·모바일375/768/1440·저장본/승인본 보호·추가 이미지/API mutation 없음.
- 캡처/결과: showroom-web/test-results/image-prompts/ 및 image-prompts-built/. 실제 이미지/AI/운영 DB·함수·사이트 배포 없음.
- 다음: 검증 코드·문서/기록을 기존 개발 브랜치에 commit/push, release 파일 포함 확인. 운영 반영·Gemini 웹 결과 품질/구조 대조는 별도 미완료.

## 2026-11-07T08:29:42.008966+09:00 — IMAGE_PROMPTS / GitHub·배포 준비 확인

- 소스 54e38a5c21283d1946be087e6654d1111661a8fb를 feature/spacepick-v2-1에 push 성공. main/운영 함수·DB·사이트 변경 없음.
- 깨끗한 소스에서 249파일 배포 준비 생성, 프롬프트 helper/패널/사용법/작업 계획과 Worker 포함·모든 파일 SHA256·PDF/첨부/환경파일 제외 검사 통과. 상태 prepared_not_deployed. 최종 기록 저장 후 패키지만 재생성.
- 다음: 기존 전체 배포 의존 순서 확인 후 프런트 운영 적용/사용자 실제 Gemini 결과 대조. 완료한 코드·검증을 반복 개발하지 않음.
