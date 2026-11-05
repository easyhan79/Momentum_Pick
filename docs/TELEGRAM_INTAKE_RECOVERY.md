# 텔레그램 신규 매물 접수 복구 — 2026-11-05

## 확인과 복구

- 13:07:53~58에 자료 6개가 별도 pending 매물로 저장됐습니다.
- 사용자가 같은 매물 자료임을 확인하여 설명이 있는 매물을 대표로 묶었습니다. 6개 원본 입력은 `telegram_merged_sources`에 보존했고 나머지는 삭제하지 않고 merged로 표시했습니다.
- 13:51:20에 전체 6개 파일을 사용하는 분석 1회가 완료됐고 완료 알림 전송이 성공했습니다. 비공개 초안이 생성됐습니다. 게시 승인은 수행하지 않았습니다.
- 분석 복구 실행: https://github.com/easyhan79/Momentum_Pick/actions/runs/41970254869
- 원본 자료 연결 실행: https://github.com/easyhan79/Momentum_Pick/actions/runs/41970620432

## 적용한 변경

- Telegram `media_group_id`로 앨범을 묶고 `update_id`로 재전송을 중복 제거합니다. 서로 다른 일반 메시지는 임의로 합치지 않습니다.
- 자료 저장과 분석 대기 작업 생성을 한 트랜잭션으로 수행합니다. 마지막 앨범 자료 후 30초 대기하며 한 번만 실행을 요청합니다.
- 첫 자료 하나만 분석하던 경로를 고쳐 첨부 전체를 전달합니다. 최대 12개·총 24MB 제한을 초과하면 모델 호출 전에 중단합니다.
- 접수 답장은 전송 성공을 확인하고 실패 코드를 저장합니다. 임대 토큰과 최대 5회 재시도로 전송 충돌을 줄입니다. Telegram 전송 직후 응답 유실 시 중복 알림 가능성은 남습니다.
- Worker에서도 미전송 접수 답장을 복구합니다. 완료 알림은 기존 Telegram 목적지를 유지합니다.
- 원본 자료를 분석 후 같은 매물에 동기화합니다. 미분류 파일은 임의로 실제 사진·도면으로 확정하지 않습니다.
- 예약 복구는 5분 간격으로 설정했지만 GitHub 예약 실행 시각은 보장되지 않습니다. 즉시 처리는 아래 연결 키가 필요합니다.
- 설정 여부는 함수 관리자 로그에 boolean으로만 기록하며 키 값·자료 내용은 출력하지 않습니다. 진단 API는 기존 서비스 키 인증을 유지합니다.

## 남은 필수 연결 설정

수신 서버 로그에서 `telegram=false dispatch=false`를 확인했습니다. GitHub Actions의 비밀 설정은 Supabase Edge Functions에 자동 공유되지 않습니다.

[Supabase Edge Function Secrets 열기](https://supabase.com/dashboard/project/aklcylhqslgntkgloqpi/functions/secrets)

| Name | Value |
|---|---|
| TELEGRAM_TOKEN | 현재 운영 중인 동일한 봇의 기존 토큰. BotFather에서 확인하되 새로 발급하여 기존 토큰을 무효화하지 않습니다. |
| SPACEPICK_GITHUB_TOKEN | 아래 저장소·권한으로 만든 GitHub fine-grained token |

[GitHub Fine-grained token 생성](https://github.com/settings/personal-access-tokens/new)

- 이름: Spacepick Intake
- Resource owner: easyhan79
- Repository access: Only select repositories → Momentum_Pick
- Repository permissions: Actions → Read and write (workflow_dispatch 호출용)
- 만료 기간을 정하고 만료 전 교체합니다. 다른 저장소·조직 권한을 추가하지 않습니다.
- 생성한 값은 위 Supabase의 SPACEPICK_GITHUB_TOKEN에 직접 저장합니다. 채팅·코드·문서에 붙이지 않습니다.

연결 도구에는 Edge Functions Secret 저장 기능이 없어 이 두 값은 소유자가 설정 화면에 입력해야 합니다. 입력 후 실제 신규 앨범 1개로 접수 답장·자동 실행·완료 답장·단일 초안 생성까지 추가 확인합니다. 기존 사진을 재전송해 시험할 경우 신규 매물로 접수되므로 가상 테스트 자료를 사용합니다.

공식 안내: [Supabase Secrets](https://supabase.com/docs/guides/functions/secrets), [GitHub workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

## 검증

API 회귀 57개 통과. DB에서 앨범 6개 단일 매물·단일 대기 작업, 재전송 중복 방지, 전송 임대/재시도, 별도 메시지 분리, anon/authenticated 접근 차단을 확인했습니다. Python 분석 회귀 11개, 답장 재시도 2개, 자료 동기화 9개, 공급자 회귀 14개를 통과했습니다.
