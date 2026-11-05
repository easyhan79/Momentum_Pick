# SpacePick v2 현행 코드 점검

점검일: 2026-11-05. 정적 코드 점검 기준. 운영 DB의 내용·배포 상태·외부 AI 서비스 동작을 확인한 결과가 아니다.

## 처리 흐름

1. `supabase/functions/clever-endpoint/index.ts`: 텔레그램 웹훅 접수, 중복 방지 및 분석 실행 연결.
2. `.github/workflows/agent.yml` → `analysis_worker.py`: Python 분석·복구 작업. PDF/이미지 첨부 분석 경로가 존재하므로 PDF 지원이 전혀 없다고 표현하면 부정확하다. 필드별 페이지 출처·충돌 검수는 별도 기능이다.
3. `analysis_worker.py`, `scripts/sync_showroom_drafts.py`, `supabase/functions/showroom-admin/index.ts`의 `toDraft`: 분석 결과에서 쇼룸 초안 생성. 세 경로 모두 현재 사실정보를 `facts: []`로 초기화한다. 변경 시 세 경로의 일관성에 주의한다.
4. `showroom-web/src/pages/AdminPropertyPage.tsx`: 로그인, 최근 매물 목록, 기존 초안 편집/미리보기, 도면·이미지·주소·검수·게시 연결. 신규 매물을 웹에서 최소정보로 만드는 등록 흐름은 별도 구현이 필요하다.
5. `showroom-web/src/pages/ShowroomPage.tsx`: 모든 유형이 Hero → Facts → AI 콘셉트 → Evidence → 계산기 → 갤러리 → 문의의 공통 순서를 사용한다.
6. `supabase/functions/public-showroom/index.ts`: 승인된 snapshot만 선택적으로 공개 DTO로 변환. 새 필드는 화면 타입에만 추가하면 공개 API에서 사라진다.

## 재사용 기반

- `types/showroom.ts`: category, Fact의 evidence/source, Zone/Concept, unknowns, assets, 선택적 계산기.
- `PlanEditor.tsx`: 실제 도면 선택, AI 분석, 수동 번호 배치 및 구역 설명 수정. 도면 없는 AI 구상도 경로도 존재.
- `ImageStudio.tsx`, `PropertyMedia.tsx`: 이미지 생성/자료 관리 기반. 업로드 API의 이미지 MIME 허용 범위와 일반 PDF 문서 보관을 구분해야 함.
- `PublishPanel.tsx`, `_shared/publication.ts`: 검수 체크, revision, 승인 후 게시. 이 기반 위에 검증/권한 규칙을 추가.
- `CrmWorkspace.tsx`, `showroom-crm`, `showroom-inquiries`: 문의·CRM 기반. 다중 매물 목록도 이미 존재.

## 구체적인 제약

- 유형 `industrial`은 공장·물류를 합친다. 원자료 확인 없는 일괄 세분화는 부정확.
- 상태는 `verified / owner_provided / ai_hypothesis / needs_review` 4종. `verified` 표시도 현재 ‘검토 기록 있음’이며 증빙 확인 완료를 보장하지 않는다.
- `save-draft` API는 제목/요약 및 기존 ID·개수에 맞춘 콘셉트의 도면/구역 편집을 중심으로 검증한다. 사실정보 편집 및 콘셉트 추가/삭제에는 저장 API 수정이 필요.
- `Evidence.tsx`는 공장·토지에도 상권 검증 관련 공통 문구를 보여준다. 첫 공장형 개선 대상.
- 공개 DTO에서 null인 fact 값이 빈 문자열로 변환되는 경로가 있다. 화면에서 빈 문자열을 ‘확인 필요’로 다루고, 데이터 계약 작업에서 API 의미를 점검한다.
- 장안리의 검증된 토지/건물·설비·도로·권리 자료는 이번 요청에 첨부되지 않았다. 예시 fixture의 수치를 실제 매물정보로 사용하지 않는다.

## 첫 구현 경계 (T02)

기존 facts에서 공장·산업용 설비, 접근, 이용조건을 찾아 유형별 검토 영역으로 표시한다. 수치나 장점을 추정하지 않고 각 fact의 출처/상태를 유지한다. 데이터가 없으면 확인할 항목으로 안내한다. 상가/토지/수익형 화면에 공장 검토 영역을 추가하지 않는다.

이 첫 구현은 웹 등록·필드 편집·자료별 권한 관리·공장형 전체 화면 완성을 뜻하지 않는다. 이후 T03~T07에서 연결한다.
