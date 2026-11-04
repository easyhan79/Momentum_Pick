# Spacepick 웹쇼룸

Node 24와 pnpm을 사용합니다.

```powershell
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
```

빌드는 React/Vite 브라우저 앱과 승인본 OG 메타데이터를 내려주는 Worker를 `dist/server/index.js`에 만듭니다. 정적 SPA 서버만 사용하면 서버 리다이렉트와 매물별 OG 정보가 적용되지 않습니다.

`/`는 서비스 소개, `/samples/terrace` 등은 실제 매물이 아닌 구성 예시입니다. `/admin`은 로그인한 관리자의 작업실, `/영문이름`은 승인된 매물입니다. 공개 프런트엔드에는 publishable key만 포함하며 service role 키는 넣지 않습니다.

[도메인 및 주소 운영 안내](../docs/SPACEPICK_DOMAIN.md)
