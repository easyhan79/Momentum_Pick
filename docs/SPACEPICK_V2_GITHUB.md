# GitHub 업데이트 절차

2026-11-06 (한국시간). 대상: `easyhan79/Momentum_Pick`.

## 확인한 연결

- `origin`: `https://github.com/easyhan79/Momentum_Pick.git`.
- `git ls-remote origin HEAD` 성공. 당시 원격 HEAD는 `c0d29a4de0d95b831178d5947c22b7b281ec855f`.
- `GIT_TERMINAL_PROMPT=0 git push --dry-run origin HEAD:refs/heads/codex/spacepick-customer-information` 성공.
- GitHub REST API의 `Forbidden`은 Git 전송까지 막혔다는 증거가 아니다. 이 환경에서는 Git 연결과 API 연결을 별도로 확인한다.
- 브라우저 로그인 정보/쿠키를 추출하거나 키를 소스/문서에 저장하지 않았다. 이미 제공된 Git 연결을 그대로 사용한다.

## 안전한 업데이트 순서

1. `git status --short`, 현재 브랜치, `git diff --check`와 최신 개발계획/검증 결과를 확인한다.
2. `git ls-remote origin HEAD`로 원격 상태를 확인한다. 원격에 새 작업이 있으면 덮어쓰거나 force push하지 않는다.
3. 변경 전용 브랜치를 만들거나 기존 변경 브랜치에서 진행한다. 이번 대상은 `codex/spacepick-customer-information`이다.
4. 승인된 소스·테스트·migration·문서만 stage한다. `showroom-web/test-results`, `dist`, 원본 PDF, `.env`, 키, 계정/고객 정보를 올리지 않는다. `git diff --cached --name-only`와 `git diff --cached --check`로 확인한다.
5. 의미 있는 메시지로 commit하고 `git push -u origin codex/spacepick-customer-information`으로 올린다.
6. `git ls-remote origin refs/heads/codex/spacepick-customer-information`을 로컬 commit과 비교해 실제 업로드를 확인한다.
7. 개발계획에 브랜치와 commit, 검증, 운영 반영 여부를 기록한다. GitHub 업로드와 웹 호스팅/DB 배포를 같은 완료 상태로 취급하지 않는다.

## 이번 배포와의 관계

현재 작업에는 고객 화면뿐 아니라 미적용 상태의 서버 함수와 additive migration이 포함되어 있다. 운영 적용 순서 확인 없이 `main`으로 바로 올려 기존 예약 작업이 새 코드를 실행하게 만들지 않는다. 변경 브랜치에 전체 수정본을 보존하고 `SPACEPICK_V2_DEPLOYMENT.md`의 DB/함수/작업자/웹 적용 순서로 이어간다.

공개 매물의 일반 등록/수정·검수 후 게시는 Supabase 데이터 변경이므로 매번 GitHub 업데이트를 할 필요가 없다. GitHub 업데이트는 프로그램 기능·디자인·서버 코드가 바뀔 때 수행한다.

GitHub API가 제공되면 변경 브랜치로 PR을 만들 수 있다. API가 차단되어도 Git push가 정상이라면 브랜치 업로드는 가능하다. 기존 호스팅의 게시 연결은 별도로 확인해야 한다.

## 실제 업로드 완료 기록

- 브랜치: `codex/spacepick-customer-information`.
- 코드 커밋: `77390f12997129dab63d6790b27ff37af753eb9b` — 고객 정보 보강과 관련 관리자/PDF/계산/서버·migration·검증/문서 105개 파일.
- `git push -u origin codex/spacepick-customer-information` 성공. 원격 브랜치의 commit을 `git ls-remote`로 재조회해 로컬 commit과 일치함을 확인했다.
- 당시 main은 `c0d29a4de0d95b831178d5947c22b7b281ec855f`로 유지. 원본 PDF/검토 생성물/키/환경파일은 업로드하지 않았다.
- GitHub 브랜치: https://github.com/easyhan79/Momentum_Pick/tree/codex/spacepick-customer-information
- GitHub API를 통한 PR 생성은 수행하지 않았다. 운영 호스팅 게시와 DB 적용은 별도 미완료다. 이후 이 문서와 작업상태만 기록하는 추가 커밋이 이어질 수 있다.
