# Telegram GitHub 실행 토큰 이름 호환 수정

2026-11-06. 사용자가 Supabase Custom secrets 화면에서 `GITHUB_PAT_TOKEN`이 등록된 것을 확인했다. 값이나 digest를 코드·기록에 복사하지 않았다.

## 확인 및 변경

- 저장소의 기존 `clever-endpoint`는 `SPACEPICK_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_PAT`만 읽었다. 기존 사용자 Secret 이름인 `GITHUB_PAT_TOKEN`이 빠져 있었다.
- 기존 이름을 유지하고 네 번째 별칭을 지원하도록 수정했다. 시작 진단과 실제 dispatch가 같은 토큰 배열을 쓰게 했다. 기존 세 이름도 계속 지원한다.
- `agent.yml` 및 즉시 실행 API(main workflow_dispatch), 접수/분석 SQL, 공개/게시 설정, 고객 데이터는 변경하지 않았다. 새 토큰 발급이나 기존 Secret 삭제는 하지 않았다.
- 이름 등록 사실만으로 토큰 유효성, 저장소 접근 범위, Actions 실행 권한을 검증한 것은 아니다. 운영 함수에 이 수정이 적용되고 실제 dispatch가 accepted인지 확인해야 한다.

## 검증

- `node supabase/tests/intake-api.test.ts`: 8개 통과. 실제 시작 코드를 네 토큰 이름 각각만 있는 모의 환경에서 불러와 health의 dispatch 설정과 main 실행 요청 Authorization을 검증했다. 토큰값이 로그에 노출되지 않음도 검증했다. 외부 요청이나 사용자 알림은 보내지 않았다.
- Edge Function TypeScript 검사 통과, `git diff --check` 통과.

## 운영 적용 상태와 다음 단계

- 소스 수정·검증 완료. GitHub main 소스 반영과 Supabase 함수 배포는 별개다.
- 코드 커밋 `246f54970ff47f2daf3eecaf00cb1876eef23986`을 원격 main과 `fix/telegram-github-pat-token`에 반영하고 원격 조회로 확인했다.
- 현재 Supabase 함수 관리 연결이 없어 운영 함수 배포는 미완료다. DB service key로 관리 API 권한을 대신하지 않는다.
- 기존 Supabase 프로젝트에서 Edge Functions → `clever-endpoint` → Code를 열어 운영 코드의 GitHub 토큰 환경변수 읽기 부분에도 `GITHUB_PAT_TOKEN`을 포함해야 한다. 운영 코드가 저장소와 다른 버전이면 기존 Webhook 인증·파라미터 처리 등을 검토하고 보존하며 필요한 별칭만 적용한다. 실제 운영 소스를 보지 않은 상태에서 함수 전체를 교체하지 않는다.
- 저장소 최신 코드의 이름 목록은 다음과 같다.

```ts
const githubTokens=['SPACEPICK_GITHUB_TOKEN','GITHUB_TOKEN','GH_PAT','GITHUB_PAT_TOKEN'].map(name=>env.get(name)||'');
```

- 적용 후 새 입력의 dispatch_code가 accepted인지, agent.yml이 main으로 자동 실행되는지 확인한다. 401/403이면 그때 기존 토큰의 유효성/Actions 권한을 점검한다. 과거 missing_token 기록은 설정을 고쳐도 자동으로 accepted로 바뀌지 않는다.
- 이 이름 호환 수정만으로 Telegram 접수 알림용 토큰 설정까지 정상이라고 결론내리지 않는다.
