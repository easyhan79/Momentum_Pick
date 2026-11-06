# SpacePick v2 공통 데이터 계약 설계 (T03)

작성일: 2026-11-05. 후속 구현 기준이며 운영 DB/API에 적용된 스키마가 아니다.

## 1. 기존 호환과 적용 순서

- 기존 `Showroom.schema_version: '1.0'`, fact key, concept/zone ID를 유지한다. 별도 확장 필드 `propertyProfile.version: 1`을 추가하는 방식으로 시작한다.
- 확장 필드가 없는 기존 승인본은 현재 방식으로 읽는다. 기존 승인본의 상태·수치·권한을 자동 승격하지 않는다.
- 비공개 초안 JSON은 `property_showrooms.draft_content`의 확장 필드에 저장하는 것을 우선 검토한다. 새 관계형 테이블/인덱스가 필요해지면 migration을 별도 작성한다.
- 순서: 서버 검증·호환 어댑터 → 관리자 저장 → 검수 조건 → 공개 DTO 선택적 허용 → 화면 연결. API에 허용되지 않은 새 필드를 화면에서 기대하지 않는다.

## 2. 확장 필드

| 필드 | 형식 | 규칙 |
| --- | --- | --- |
| `propertyProfile.version` | 정수 1 | 지원하지 않는 버전은 저장 거절 |
| `propertyProfile.kind` | factory / logistics / commercial / land / unknown | 공장·물류 분리. 기존 industrial만으로는 추정하지 않음 |
| `propertyProfile.transaction` | sale / lease / unknown | 협의 상태와 거래 종류는 별개 |
| `propertyProfile.price` | `{status: fixed / negotiable / unknown, saleWon, depositWon, monthlyWon}` | 원 단위 비음수 안전정수 또는 null. fixed일 때 거래 유형별 필수 금액 확인. 미입력 금액을 0으로 변환하지 않음 |
| `propertyProfile.fields` | 검토 항목 배열 | ID/key/label/value/unit/status/sourceIds/verification/publication 포함 |
| `propertyProfile.highlights` | 최대 3개 배열 | 제목·설명·fieldIds·제약 포함. 연결된 공개 가능 근거가 없으면 공개하지 않음 |
| `propertyProfile.modules` | 선택적 모듈 | 임대·운영 분석은 기본 유형과 별도로 선택. T10a의 rentalScenario만 선택 지원. 수익을 추정 생성하지 않음 |

담당자의 사용자 ID·업무용 공개 연락처는 구분한다. 내부 계정 식별자나 개인정보를 프로필 전체와 함께 공개하지 않는다. 공개 담당자 표시는 T06에서 별도 DTO로 검증한다.

## 3. 사실정보와 출처

검토 항목의 필드:

- `id`: 매물 내 고유 ID. 수정해도 유지. `key`: 의미를 정한 안정적인 코드.
- `label`: 표시 이름. `value`: 문자열/유한 숫자/null. 면적 단위는 ㎡, 전력 kW, 층고 m 등을 명시하고 평 환산 시 원값을 유지한다. 빈 문자열은 null로 정규화하고 숫자 0은 보존한다.
- `status`: verified / provided / inferred / generated / unknown.
- `sourceIds`: 비공개 원본 자료 레코드 참조. sourceId만으로 공개 다운로드 권한을 부여하지 않는다.
- `verification`: 확인자·확인 시각·확인 방법/메모·관련 증빙 참조. verified는 실제 증빙 대조와 기록이 있을 때만 사용한다. 확인 시각과 정보 기준일은 구분한다.
- `publication`: private / approved. 기본 private. 사실이 확인됐다는 이유로 공개 승인을 자동 부여하지 않는다.

원본 자료에는 유형(사진/도면/문서/설명), 제공자, 제목, 정보 기준일, 원문 페이지, 사용 권한 확인 기록을 관리한다. 자료 사용 권한과 공개 승인은 별개다. 내부 저장 경로/계약 원문/제공자 개인정보는 기본 공개 DTO에서 제외한다.

### 상태 호환

| 기존 상태 | 새 구조에서의 취급 |
| --- | --- |
| owner_provided | provided. 출처는 보존하되 증빙 대조로 간주하지 않음 |
| ai_hypothesis | 기존 화면 표현 유지. 생성 경로를 확인한 경우에만 generated/inferred로 구분; 일괄 추정 변환 금지 |
| needs_review | unknown 또는 값은 있으나 미확인인 provided 등으로 사람 검토 후 선택 |
| verified | 기존 ‘검토 기록 있음’ 의미 보존. 증빙 기록 없는 새 verified 변환 금지 |

새 구조를 기존 Fact 화면에 투영할 때 inferred/generated는 활용 가설로 표시한다. 원본 상태는 확장 필드에 보존한다. 새 verified는 검증 기록이 있는 경우에만 기존 verified 표시로 연결한다.

## 4. 공장형 최초 지원 key

토지/건물: land_area, building_area, gross_floor_area, building_use.

설비: power_capacity, clear_height, floor_load, column_spacing, water_supply, wastewater, equipment.

접근/이용: road_access, vehicle_access, loading_access, work_flow, land_use_zone, factory_registration, permits.

기존 power/road/permit 등의 key는 읽기 어댑터에서 유지한다. 자료가 여러 개이거나 값이 충돌하면 하나를 임의 선택하지 않는다. 같은 key에 다른 source/value를 가진 항목을 허용하고 공개할 대표값은 사람이 결정한다.

## 5. 저장·검수·공개 계약

- 매물 소속과 관리자 권한을 서버에서 확인한다. 클라이언트가 보낸 confirmed/admin 등의 주장은 권한 판단에 사용하지 않는다.
- 저장은 기존 revision 비교 후 갱신(CAS)을 유지한다. 다른 편집이 있으면 409와 최신본 재확인 안내. 공개본은 수정하지 않는다.
- 서버는 허용 필드·enum·문자열 길이·배열 개수·금액 범위를 검증한다. sourceIds는 해당 매물에 속하는 자료여야 한다. 초깃값은 필드 60개, 근거 참조 각 10개, 하이라이트 3개, 각 설명 2000자 이내로 제한하고 전체 요청 크기 제한과 함께 테스트한다.
- 임시 저장은 누락을 허용한다. 공개 전 유형/거래방식·소재지·면적 검토·가격 상태·담당자·사용/공개 권한을 서버에서 확인한다. 확인 필요인 사실은 확인된 값으로 게시하지 않는다.
- 공개 DTO는 승인 snapshot에서만 필드를 고른다. `publication: approved`이고 관련 자료의 사용/공개 범위와 충돌하지 않는 값만 노출한다. 일부 field가 비공개라면 그 값을 인용한 highlight도 제외한다.
- 자료 원문은 필드 값과 별도의 공개 승인 및 접근 검증을 요구한다. PDF 추출 결과의 승인만으로 원문을 공개하지 않는다.
- 기존 공개 snapshot은 계약 적용만으로 차단하지 않는다. 새 확장 프로필을 추가한 뒤 재승인하는 매물부터 새 규칙을 적용하는 호환 경로를 검증한다.

## 6. T04 구현 범위와 필수 검증

T04는 공장형 필드 편집→저장→승인→공개 DTO 연결을 작은 단위로 구현한다. 운영 배포/실제 매물 수정은 별도 승인 전 진행하지 않는다.

필수 검증: 기존 snapshot 호환, null/0/공백, 단위 유지, 출처의 다른 매물 참조 거절, 검증 기록 없는 verified 거절, private 자료/값/하이라이트 누출 방지, revision 충돌, 초안 수정 후 공개본 유지. 이후 T05에서 실제 자료를 대조하며 화면 전체를 완성한다.


## T04 구현 반영 (2026-11-05)

- 필드에 `sourceText`(공개 가능한 출처 요약)와 `useApproved`를 추가하고, profile에 `sourcePermissions` 배열(assetId/useApproved/allowDerivedPublication)을 저장한다. 원본 공개 권한과 추출 정보 공개 허용은 구분한다.
- sourceIds는 기존 property_assets의 UUID를 참조하며 서버가 매물 및 private-media 소속을 검사한다. 텍스트 제공정보는 sourceText로 기록 가능하지만 verified는 실제 비AI 첨부 증빙이 필요하다.
- verification은 method/by/at로 저장한다. 신규·변경된 verified는 명시적 대조 확인이 필요하며 by/at는 서버에서 기록한다. 변경 없는 기존 확인 기록은 보존한다.
- 별도 출처 테이블/페이지 추출/정보 기준일 필드는 T09에서 확장. 현재 문서 원본 업로드 범위와 운영 배포는 확대하지 않았다.

## T09 / T10a 구현 반영 (2026-11-06)

- PDF 추출 후보는 source_index/page/quote와 실제 원본 asset을 연결한다. `_document_inspections`에는 원본 SHA256/쪽수/읽기 실패·텍스트 없는·제한 페이지 번호만 저장하고, `_document_checks`는 후보 fingerprint와 원본 SHA256에 결합한다. 인용문 존재 검사는 사실 status와 독립이다.
- 가져온 필드는 provided/private/useApproved=false. private `documentReview.entries`에 fieldId/sourceVersion/candidateIndex/sourceIndex/page/quote/sourceCheck/assetId/by/at를 최근 200개까지 보존한다. 공개 DTO에서 전체 이력을 제외한다.
- 웹 registration.analysisDocumentIds는 선택적 UUID 배열(최대 12개). undefined는 매물의 전체 PDF, []는 PDF 없이 분석한다. 명시된 ID의 매물 소속과 PDF 유형은 저장 및 요청에서 재검증한다. 제외는 삭제가 아니다.
- `propertyProfile.modules.rentalScenario`는 `{enabled,publication,purchasePrice,annualRent,operatingCosts,vacancyBps,notes}`. 각 입력은 `{value,basis,sourceText}`이며 basis는 provided/assumption이다. value=null과 0을 구분한다. 금액은 0~10^15 원 정수, 공실은 0~10000 basis points(1bp=0.01%). 매입가가 0이면 계산하지 않는다.
- 계산 모듈은 기본 private. 활성화+approved+완전한 유효 입력+provided의 출처 설명이 있을 때만 공개 DTO의 최상위 rentalScenario를 허용한다. 저장 정규화/공개 projection은 허용한 키만 복사한다. 불완전한 승인 요청은 공개 전 검사에서 차단한다. disabled/private 모듈은 매물 공개를 막지 않고 숨긴다.
- sourceText와 notes는 공개 선택 시 고객에게 보이는 설명이다. 개인정보를 제외하라는 입력 안내를 제공하며 원본 파일이나 내부 검토 기록을 넣는 필드가 아니다.
- 연 공실 차감액=연 임대료×공실bps/10000(원 반올림); 연 운영수지=연 임대료−공실 차감액−연 운영비. BigInt 정수로 계산하고 입력 매입가 대비 비율을 소수 둘째 자리 반올림한다. 음수 결과를 보존하며 대출·이자/취득·소득세/초기공사비·보증금 차감은 제외한다.
- 방문자 변경은 React 로컬 상태에만 유지하고 원래 승인값·DB에 쓰지 않는다. 복원 버튼은 승인 기준값으로 되돌린다. 외부 시세·공실·성과를 추정하지 않으며 투자수익률/감정평가로 표시하지 않는다. 기존 calculator와 기존 확장 없는 snapshot도 유지한다.

## T09b 내장 원문 페이지 보기 (2026-11-06)

- 관리자 문서검토 후보에 sourceSha256을 선택 제공한다. 이 값은 같은 매물의 서버 원본 연결과 유효한 inspection digest가 있을 때만 전달한다. 클라이언트가 임의로 제출한 hash를 사용하지 않는다. 공개 DTO는 문서 후보/검토 메타데이터를 노출하지 않는다.
- 뷰어는 기존 인증·매물 소속 검사를 거친 PDF download 응답을 메모리에서 읽는다. Content-Type/8MB 스트리밍 제한/PDF header와 선택적 SHA256을 확인한 뒤 같은 사이트에서 제공하는 PDF.js Worker로 페이지를 렌더링한다. PDF 원본·추출 텍스트를 새 DB/공개 storage에 복제하지 않는다.
- 후보 페이지가 원본 범위를 벗어나면 이를 알리고 1쪽을 명시적으로 표시한다. 원본 페이지 이동/확대, 해당 페이지의 추출 텍스트와 후보 인용을 나란히 보여주고 이미지 페이지의 직접 대조를 지원한다. OCR이나 사실 검증 승격은 수행하지 않는다.
- 관리자 화면만으로 사용하며 원문을 외부 뷰어에 보내지 않는다. renderer/Worker/CMap/표준 폰트/decoder·종속 라이선스는 빌드 산출물에 포함한다. JavaScript evaluation/annotation 실행 계층을 사용하지 않는다. 기존 PDF 다운로드/API 권한/DB schema는 유지하므로 신규 migration은 없다.

## v2.1 S1~S4 확장 (2026-11-07, 로컬)

- 기존 income을 건물 전체로 사용하도록 propertyProfile.kind의 허용 값에 income을 추가했다. 기존 industrial은 자동 세분화하지 않는다. schema_version/profile version 및 기존 snapshot을 유지한다.
- 필드 asOf는 선택적 YYYY-MM-DD 정보 기준일이다. 실제 달력 날짜를 검사하며 verification.at(대조한 시각)과 구분한다. 미제공 날짜를 현재 날짜로 채우지 않는다.
- modules.customerDecision은 {version:1,enabled,publication,purposes:[{id,label}],reviewedBy?,reviewedAt?}. 기본 private. reviewConfirmed는 저장 요청에서만 사용하고 실제 확인자/시각은 서버가 부여한다. 근거·권한·목적 변경시 확인을 무효화한다. 이 검토 확인은 사실 검증 완료가 아니다.
- 공개 customerDecision은 활성화+별도 공개 선택+검토 기록이 있는 승인 snapshot에서만 허용한다. 공개 가능한 profile field만 사용해 결론/근거·기준일/의미·제약/추가 확인사항을 만들며 원본 ID·검증 메모·확인자 계정은 제외한다. legacy verified를 신규 증빙 확인으로 승격하지 않는다.
- purpose query는 방문자 상태다. 서버 저장값을 바꾸지 않는다. 공개 필요항목 ID는 need-{허용 slot key}; private fact UUID를 공개 문의 ID로 사용하지 않는다.
- 콘셉트 purposeIds는 해당 매물 유형의 카탈로그 ID만 허용한다. canonical purposeContext(필수조건·제약·추가 확인)는 서버에서 만들고 클라이언트가 보낸 내용을 믿지 않는다. 목적 ID 집합 변경은 기존 이미지 무효화/예산 보호 RPC를 재사용한다. 공개 DTO는 purposeIds만 허용하고 내부 생성 문맥은 제외한다.
- 문의 request_context는 선택적 {version:1,propertyId,purposeId,conceptId,checkIds}. 서버는 해당 slug의 현재 승인 snapshot을 공유 공개 DTO로 투영한 뒤 매물·목적·콘셉트·공개 체크 ID를 검증하고 라벨은 직접 재구성한다. 기존 CRM memo에 정규화한 문맥+고객 메모를 합쳐 저장하며 전체 2000자 제한을 지킨다. 개인정보 보관기간이 끝나면 기존 memo 삭제 정책으로 문맥도 지워진다.
- 새 crm_register_context_inquiry RPC는 공개 매물과 승인 revision을 FOR SHARE로 고정한 뒤 기존 crm_register_inquiry를 호출한다. 기존 요청/알림/보관/속도/중복 제한을 유지한다. 다른 매물·stale revision·중복 fingerprint 변경·비공개 ID 요청은 거절한다. 신규 테이블·컬럼은 없고 추가 함수 migration 20261107010000_customer_inquiry_context.sql만 로컬 작성했다. 기존 request_context 없는 클라이언트는 기존 RPC 경로를 그대로 쓴다.
- 실제 운영 적용 순서: 기존 migration 상태 확인 → 새 RPC → 관련 공유 모듈/문의·공개·관리 함수 → 프런트. 새 함수 없이 새 UI를 먼저 배포하거나 실패시 안전 검증을 건너뛰는 fallback을 하지 않는다.
