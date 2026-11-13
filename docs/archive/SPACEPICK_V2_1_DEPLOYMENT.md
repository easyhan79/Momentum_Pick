# SpacePick v2.1 운영 적용·복구 준비

기준: 2026-11-07. 이 문서는 배포 준비 절차다. 실제 운영 DB/함수/호스팅에 적용한 기록이 아니다. 기존 배포 승인은 유지하며 관리 연결·현재 운영 버전을 확인한 후 실행한다.

## 변경 범위

- Showroom.schema_version 1.0 / propertyProfile.version 1 / 기존 slug·fact/concept/zone ID 유지.
- income 유형을 건물 전체 편집·검토에 활용. 기존 industrial은 자동 분류하지 않는다.
- optional asOf, customerDecision 설정/동결 보고서, concept purposeIds 추가. 기존 승인 snapshot에 이 필드를 일괄 주입하거나 기존 분석/이미지를 재생성하지 않는다.
- 새 테이블·컬럼 없음. 추가 RPC migration은 `supabase/migrations/20261107010000_customer_inquiry_context.sql` 하나다. 기존 문의 메모·보관/중복/속도 제한·알림과 CRM을 재사용한다.
- 로컬 제공자료 규칙 분석이며 외부 상권/시장/API·유료 서비스 설정 변경은 없다. 새 AI 유료 호출·이미지 슬롯·재시도 예산 확대도 없다.

## 적용 순서

1. 현재 운영 호스팅 프로젝트, 함수 버전, 적용 migration 이력 및 복구할 이전 버전을 기록하고 필요한 백업을 확인한다. 현재 연결로는 이 정보를 검증하지 못했다.
2. `supabase/review/v21_preflight.sql`의 읽기 전용 객체/권한 점검과 실제 migration 이력을 대조한다. 기존 CRM·영구주소·listing_state 선행 객체가 필요하다. 비슷한 20261104114744/20261104114801 파일을 모두 무조건 재실행하지 않는다. 이미 적용된 구조를 다시 만들지 않는다.
3. 테스트 환경에서 기존 보호/권한 검사 후 새 RPC만 필요한 경우 적용한다. anon/authenticated에는 실행 권한을 주지 않는다. 기존 CRM 함수를 지우거나 운영 데이터를 교체하지 않는다.
4. 변경된 `showroom-admin`, `public-showroom`, `showroom-inquiries`와 의존 `_shared` 모듈을 함께 배포한다. 특히 분리한 `public-showroom-dto.ts`, `customer-purpose.ts`, `customer-decision.ts`, `analysis-rules.ts`, `customer-inquiry.ts`와 profile/concept/web-registration 변경을 빠뜨리지 않는다. `showroom-crm`의 기존 상세 조회는 정규화한 메모를 그대로 표시한다.
5. GitHub 작업자가 최신 `analysis_worker.py`, `image_worker.py` 및 기존 의존 파일을 사용하는지 확인한다. v2.1은 개발 브랜치에 보관했으며 운영 main으로 자동 병합하지 않았다. 이미지/AI 생성은 기존 큐와 예산으로만 실행한다.
6. 프런트 build Worker와 정적 자산을 기존 호스팅 프로젝트에 배포한다. 기존 대상은 `showroom-web/.openai/hosting.json`이며 임의의 새 사이트·도메인을 만들지 않는다. 새 문의 UI를 새 RPC/서버보다 먼저 배포하지 않는다. 서버 오류 때 안전 검증을 생략하는 저장 fallback은 없다.
7. 합성 전용 매물로 관리자 등록→근거/목적 입력→비공개 검토→검수/승인→목적 선택→확인 요청→CRM을 실제 인증으로 확인한다. 이미지 승인 전후, 비공개 PDF/타 매물 접근, 중복/속도 제한, 공개본 보존도 확인한다. 실제 매물을 자동 재승인하지 않는다.
8. 적용 commit·migration 일시·함수/프런트 버전·URL·실행 결과를 RUN_STATE/PROGRESS와 요약 계획에 남긴다. 이 증거가 없으면 운영 완료로 표시하지 않는다.

## 운영 검증에서 별도로 남은 항목

- 기존 Supabase DB/함수 및 호스팅 관리 연결과 실제 배포 상태.
- 기존 `GITHUB_PAT_TOKEN` 호환 수정의 운영 clever-endpoint 적용·즉시 자동 실행 확인. v2.1 로컬 완료와 별개다.
- 실제 AI 응답, 실사진/도면의 구조 보존, 실제 매물 문서/임대차·인허가·입지 사실의 정확도.
- 외부 공급원의 계약/재사용/과금/기준일·주소 매칭을 확인한 상권/시장 데이터 연결(T10b).

## 복구

- 배포 실패: 확인한 이전 프런트/Edge 버전으로 되돌린다. 새 요청 UI를 먼저 이전 버전으로 복구하고, 정상인 기존 고객 승인 snapshot을 보존한다.
- 추가 RPC는 구버전 클라이언트가 사용하지 않으므로 그대로 둬도 기존 경로를 바꾸지 않는다. 불필요한 DB 파괴적 rollback을 하지 않는다. 제거가 필요하면 의존과 실제 사용을 확인한 별도 변경으로 다룬다.
- JSON draft 편집은 기존 revision/CAS로 보호한다. 충돌 시 최신 저장본을 다시 읽어 사용자의 수정과 대조한다. 덮어쓰기나 자동 재승인은 하지 않는다.
- 분석 검토 후 근거가 바뀌면 검토 확인을 무효화한다. 고객은 재승인 전 기존 동결 보고서를 본다.
- 중단/한도: RUN_STATE/PROGRESS와 git diff를 읽어 마지막 미완료 단위부터 이어간다. 사용량 해제 시 자동으로 새 세션을 시작하는 스케줄러는 설치하지 않았다.
