# Spacepick

스페이스픽은 상가·공장·물류·토지·건물 매물마다 **전용 웹쇼룸**을 만들고, 같은 내용으로 **블로그 글과 카드뉴스**까지 준비하는 서비스입니다. 관리자는 매물 정보를 입력하고 기획서를 한 번 확인한 뒤, 미리보기를 보고 게시합니다.

> **현재 상태와 다음 작업은 [관리자 작업 단순화 계획서](docs/SPACEPICK_SIMPLIFICATION_PLAN.md)가 기준입니다.** 작업 전에 먼저 읽고, 단계를 마치면 그 문서의 진행 기록을 갱신합니다. 지난 계획·보고서는 [docs/archive](docs/archive/README.md)에 있습니다.

## 화면

| 주소 | 화면 |
| --- | --- |
| `/` | 서비스 소개 |
| `/samples/terrace` 등 | 구성 예시(실제 매물 아님) |
| `/영문이름` | 게시된 매물 쇼룸과 문의 접수 |
| `/admin` | 관리자 작업실: ① 입력·자료 → ② 기획 확인 → ③ 미리보기·게시 |

관리자 사용법은 [관리자 사용 안내](docs/SPACEPICK_ADMIN_USER_GUIDE.md)를 보세요.

## 구성

```
showroom-web/            웹앱(React + Vite)과 공유 메타데이터를 내려주는 Worker(server/router.mjs)
supabase/functions/      Edge Function: showroom-admin(관리자 API), public-showroom, showroom-assets, showroom-inquiries, showroom-crm
supabase/functions/_shared/  서버·웹앱이 함께 쓰는 규칙(사실정보, 게시 조건, 기획서, 이미지 설정 등)
supabase/migrations/     운영 DB 변경 이력(빈 DB에 순서대로 적용됨을 테스트로 확인)
supabase/review/         검토용 SQL과 운영에서 내보낸 참고 정의
web_worker.py 등         AI 분석·글 작성·이미지 생성 작업자(GitHub Actions에서 실행)
scripts/                 운영 점검·동기화 스크립트
tests/, supabase/tests/  Python·TypeScript 테스트
docs/                    계획서와 참고 문서(지난 기록은 docs/archive)
```

어떻게 연결되는지는 [아키텍처](docs/SPACEPICK_V2_ARCHITECTURE.md), 데이터 형식은 [데이터 계약](docs/SPACEPICK_V2_DATA_CONTRACT.md)을 보세요.

## 로컬에서 실행

웹앱(Node 22 이상, pnpm):

```bash
cd showroom-web
pnpm install --frozen-lockfile
pnpm run dev      # http://127.0.0.1:5173
pnpm run build    # dist/server/index.js(Worker) 생성
```

테스트:

```bash
node --test supabase/tests/*.test.ts supabase/tests/*.test.mjs tests/*.test.ts
python3 -m unittest discover -s tests -p 'test_*.py'
```

DB 테스트(`*-db.test.mjs`)는 PGlite가 필요합니다. `npm i @electric-sql/pglite`로 설치한 뒤 `PGLITE_MODULE`에 그 `dist/index.js` 경로를 지정하세요. 브라우저 검사는 `showroom-web/scripts/*-qa.cjs`이며, 개발 서버를 띄운 상태에서 `node scripts/<이름>.cjs`로 실행합니다.

## 배포

배포 대상은 네 가지이며 서로 독립적입니다.

| 대상 | 방법 |
| --- | --- |
| 웹앱 | `showroom-web`에서 빌드한 `dist/server/index.js`를 chatgpt.site 호스팅에 배포(spacepick.kr 연결). 정적 SPA 서버만 쓰면 매물별 공유 정보가 빠집니다. |
| Edge Function | `supabase functions deploy <이름> --project-ref aklcylhqslgntkgloqpi` |
| DB 마이그레이션 | `supabase/migrations`의 새 파일을 운영 DB에 적용(SQL Editor 또는 `supabase db push`) |
| AI 작업자 | `main`에 `web_worker.py`·`image_worker.py` 등이 바뀌면 GitHub Actions(`web-worker.yml`)가 자동으로 새 코드로 실행 |

게시 규칙은 웹앱과 `showroom-admin`에 함께 있으므로, 둘 다 바뀐 경우 **함수를 먼저, 웹앱을 바로 이어서** 배포합니다. 도메인 설정은 [도메인 안내](docs/SPACEPICK_DOMAIN.md), 운영 점검·복구는 [운영 안내](docs/ADMIN_WEB_OPERATIONS.md)를 보세요.

## 환경변수

값은 저장소에 넣지 않습니다. 비밀값은 Supabase 함수 비밀, GitHub Actions secrets, 호스팅 환경 설정에 둡니다.

| 위치 | 이름 | 용도 |
| --- | --- | --- |
| 웹앱 빌드 | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SPACEPICK_ENV`, `VITE_PRIVATE_PREVIEW` | 브라우저가 쓰는 공개 주소·공개 키, 환경 구분, 비공개 미리보기 |
| 웹앱 Worker | `SPACEPICK_PUBLIC_ORIGIN`, `SPACEPICK_SUPABASE_URL`, `SPACEPICK_RECOVERY_REDIRECT`, `SPACEPICK_PRIVATE_PREVIEW`, `SPACEPICK_PREVIEW_PROJECT_ID` | 공개 주소, 비밀번호 재설정 이동 주소, 미리보기 설정 |
| Edge Function | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | DB 접근(서버 전용) |
| Edge Function | `ADMIN_WEB_ENABLED`, `WEB_PROCESSING_ENABLED`, `COPY_REWRITE_ENABLED`, `WEB_API_IMAGES_ENABLED`, `PRIVATE_PREVIEW_ENABLED`, `WORKER_ENVIRONMENT` | 기능 켜기·끄기 |
| Edge Function | `GH_PAT`, `GITHUB_TOKEN`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID` | GitHub Actions 실행 요청, 텔레그램 알림 |
| GitHub Actions secrets | `SUPABASE_URL`, `SUPABASE_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `PUBLIC_DATA_API_KEY` | 작업자의 DB·AI·알림·공공데이터 접근 |
| GitHub Actions vars | `WEB_WORKER_ENABLED`, `INTAKE_V2_ENABLED`, `INTAKE_V2_ONLY`, `COPY_REWRITE_ENABLED`, `AI_PROVIDER_ORDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL` | 작업자 기능 켜기·끄기, AI 순서와 모델 |

`WEB_API_IMAGES_ENABLED`가 `true`일 때만 관리자 화면에서 API 이미지 생성(장당 250원 예약, 매물당 2,500원 한도)을 요청할 수 있습니다. 작업자 설정 예시는 [`deploy/web-worker/web-worker.env.example`](deploy/web-worker/web-worker.env.example)에 있습니다.

## 참고 문서

- [관리자 사용 안내](docs/SPACEPICK_ADMIN_USER_GUIDE.md)
- [운영 안내](docs/ADMIN_WEB_OPERATIONS.md) · [도메인 안내](docs/SPACEPICK_DOMAIN.md) · [GitHub 업데이트 절차](docs/SPACEPICK_V2_GITHUB.md)
- [다시 글작성](docs/COPY_REWRITE.md) · [Gemini 웹 이미지 프롬프트](docs/IMAGE_PROMPTS.md)
- [외부 데이터 요구사항(4단계 상권·입지)](docs/SPACEPICK_V2_EXTERNAL_DATA.md) · [텔레그램 접수 복구](docs/TELEGRAM_INTAKE_RECOVERY.md)

기존 GitHub 저장소 이름과 chatgpt.site 호스트명은 배포와 기존 링크 호환을 위해 유지합니다.
