# Spacepick

스페이스픽 매물별 웹쇼룸과 콘텐츠 제작 서비스입니다.

- 메인 `/`: 서비스 소개와 구성 예시
- 매물 `/영문이름`: 승인본 쇼룸과 문의 접수
- 관리자 `/admin`: 초안·자료·주소·검수·상담 관리
- [가비아 도메인 연결과 운영 안내](docs/SPACEPICK_DOMAIN.md)
- [SpacePick v2 개발계획·작업상태·재개 안내](docs/SPACEPICK_V2_PLAN.md)
- [현재 개발 완료·미완료 항목과 다음 작업 순서](docs/SPACEPICK_CURRENT_DEVELOPMENT_STATUS.md)
- [관리자 웹 주 입력·AI 작업자 전환 실행계획](SPACEPICK_ADMIN_WEB_TRANSITION_PLAN.md)
- [SpacePick v2 검증·적용 순서](docs/SPACEPICK_V2_VALIDATION.md)
- [실제 구현 기준 아키텍처와 매물 게시/프로그램 배포 구분](docs/SPACEPICK_V2_ARCHITECTURE.md)
- [v2.1 완료 보고서·남은 운영 작업](SPACEPICK_V2_1_REPORT.md)
- [본인 전용 배포·개발 검증 계획](SPACEPICK_PRIVATE_PREVIEW_PLAN.md)
- [등록 매물 다시 글작성 기능·사용법·배포 조건](docs/COPY_REWRITE.md)
- [Gemini 웹용 이미지 생성·수정 프롬프트](docs/IMAGE_PROMPTS.md)
- [v2.1 재개 상태](SPACEPICK_V2_1_RUN_STATE.json) / [작업 기록](SPACEPICK_V2_1_PROGRESS.md)
- [GitHub 업데이트 절차](docs/SPACEPICK_V2_GITHUB.md)

웹 앱은 `showroom-web`에서 `pnpm install --frozen-lockfile`, `pnpm run build`로 빌드합니다. Worker가 승인본 공유 메타데이터와 브라우저 앱을 제공합니다. 운영 DB 변경 이력은 `supabase/migrations`에 있습니다.

기존 GitHub 저장소와 chatgpt.site 호스트명은 배포 및 기존 링크 호환성을 위해 유지합니다.
