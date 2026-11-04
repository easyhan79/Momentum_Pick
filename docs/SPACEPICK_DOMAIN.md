# Spacepick 도메인 연결 — 가비아

사이트 측 `spacepick.kr`, `www.spacepick.kr` 등록은 완료했습니다. 2026-11-04 확인 시 DNS 인증과 HTTPS 발급은 대기 상태입니다.

가비아 로그인 → 서비스 관리 → DNS 관리툴 → spacepick.kr 선택 → DNS 설정 → 레코드 추가 → 각 행 확인 → 저장.
공식 안내: https://customer.gabia.com/manual/dns/3041/3040
가비아 네임서버를 쓰는 경우 아래 값을 입력합니다. 다른 업체의 네임서버를 쓰면 해당 업체 DNS에서 입력합니다.

| 타입 | 호스트 (가비아 입력값) | 값 |
|---|---|---|
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=BSIK8CEbPBPBYlFSmExcswLSVL2YqLUqvNCwfQ6dY2Q |
| TXT | _cf-custom-hostname | a78b6f75-d89d-4953-a2b5-bcf70b5481f3 |
| CNAME | www | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.www | openai-site-verification=Imb1kFCKrJ7ID5DUGg8gotMet1uyrOhSskPF912LX14 |
| TXT | _cf-custom-hostname.www | 4565220e-4a02-4a52-9086-724a3f724e54 |

TTL은 가비아 기본값을 사용해도 됩니다. 기존 메일용 MX/TXT 레코드는 유지합니다. @/www에 기존 웹 연결용 A/AAAA/CNAME이 있으면 충돌 여부를 확인해 웹 연결 레코드만 수정합니다. www CNAME과 동일 호스트의 A 레코드는 함께 두지 않습니다.

저장 후 사이트의 도메인 상태를 새로 확인하여 active 및 HTTPS 발급을 검증합니다. www는 https://spacepick.kr 의 같은 경로로 이동합니다. 인증 전에는 기존 chatgpt.site 주소를 사용합니다.

## 관리자와 영문 주소

- `/`: Spacepick 서비스 소개
- `/admin`: 관리자 작업실 (로그인 필요)
- `/samples/terrace`, `/samples/factory`, `/samples/land`: 정적 구성 예시
- `/영문이름`: 승인된 매물 쇼룸
- 관리자의 ‘매물 영문 주소’에서 후보를 선택하거나 직접 입력하고 저장합니다. 기존 UUID 주소는 임의 변경하지 않았습니다.
- 이전 `?p=주소`와 변경 전 주소는 현재 주소로 301 이동합니다. 이전 주소는 다른 매물에 재사용하지 않습니다.
- 거래 완료 시 같은 URL에 완료 안내를 표시하고 공개 문의·미디어 접근을 마감합니다. 초안이나 비공개 매물은 404로 처리합니다.
- 카카오톡 공유용 OG 정보는 서버에서 승인된 내용으로만 만듭니다. 승인된 대표 이미지가 없으면 Spacepick 브랜드 이미지를 사용합니다.

## 연결 후 남은 설정

Supabase Auth URL Configuration에 `https://spacepick.kr/admin/reset`를 추가한 다음 Sites의 `SPACEPICK_RECOVERY_REDIRECT`를 같은 주소로 설정합니다. 등록 전에는 기존 허용된 비밀번호 재설정 주소를 유지하여 재설정 메일이 깨지지 않게 했습니다.

기존 chatgpt.site 호스트명과 GitHub 저장소 이름은 링크·배포 호환성을 위해 유지합니다. 고객 화면, 다운로드 파일명, 콘텐츠 브랜드는 Spacepick입니다. 도메인 활성화 전의 운영 알림은 기존 호스트의 `/admin`으로 연결합니다. 문의 알림에는 접수 번호와 관리자 링크만 보내며 고객 상세 정보는 로그인 후 확인합니다.

## 검증

타입 검사, 프로덕션 빌드, API 회귀 검사, 서버 OG/리다이렉트 검사, PGlite 주소 중복·이전 주소 보존·권한·거래 완료 문의 차단 검사를 수행합니다. DNS/HTTPS 및 실제 카카오톡 링크 캐시는 도메인 인증 후 추가 확인 대상입니다.
