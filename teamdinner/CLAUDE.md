# teamdinner — Agent Notes

## 프로젝트 컨텍스트

팀 회식 전에 "뭐 먹을지"를 미리 모으는 장바구니. 주최자가 네이버 플레이스 공유 링크를
붙여넣으면 메뉴판을 가져오고, 팀원은 회식 링크(`/e/<slug>`)를 열어 **이름만 적고** 메뉴를
수량과 함께 담는다. 장바구니 탭에 메뉴별·사람별 집계와 예상 금액이 모인다.
로그인 없음 · 주문 마감 없음(2026-11-03 결정). 모노레포 `solution` 안의 독립 프로젝트.

## 스택 / 핵심 결정

- Next.js 16 + React 19 + Tailwind v4 + shadcn v4 `base-nova`(`@base-ui/react`, `asChild` 미지원
  → `render={<Button />}`), lucide, sonner, react-query. npm.
- DB: Neon Postgres + Drizzle. 드라이버는 **`@neondatabase/serverless` WebSocket Pool**
  (`drizzle-orm/neon-serverless`, `src/db/index.ts`). HTTP(neon-http)가 아닌 이유는 로컬 개발용
  wsproxy(`docker-compose.yml`)가 WebSocket만 중계해서다. 스키마 반영은 `npm run db:push`
  (drizzle-kit, 마이그레이션 파일 없음). drizzle-kit은 devDependency `pg`로 직접 붙는다.
- 환경변수는 `DATABASE_URL` 하나. 로컬은 `NEON_LOCAL_PROXY`를 더 둔다(`.env.example`).
- PWA는 직접 작성한 `public/sw.js` + `manifest.json`(Serwist/next-pwa는 Turbopack과 충돌).
  **`/api/*`는 캐시하지 않는다** — 5초 폴링 데이터라 낡은 사본이 해롭다. 아이콘은
  `npm run icons:generate`(sharp)로 굽고 커밋한다. 마크 기하는 `src/lib/brand-mark.ts`.
- 서체는 시스템 스택(`globals.css`). `next/font/google`은 Turbopack dev에서
  "next/font/google queries have exactly one entry"로 깨져 뺐다(2026-11-03).
- 갱신은 react-query `refetchInterval: 5000`(`EventView.tsx`). 담기는 낙관적 갱신 후 invalidate.
- 신원 = `localStorage["teamdinner:name"]`. `useSyncExternalStore`로 읽는다(`src/lib/use-member.ts`) —
  effect 안 setState는 eslint `react-hooks/set-state-in-effect`에 걸린다.
- Vercel: `vercel.json` `regions: ["icn1"]`. 프로젝트 Root Directory는 `teamdinner`.

## 네이버 메뉴 수집 (`src/lib/naver/`)

- 링크 → placeId: `naver.me/*`는 `redirect: "manual"`로 `Location`만 읽는다
  (→ `map.naver.com/p/entry/place/<id>`). 그 외는 정규식으로 `/<type>/<id>` 추출.
- 메뉴: `GET https://m.place.naver.com/restaurant/<id>/menu/list` (모바일 UA) HTML 안의
  `window.__APOLLO_STATE__`. `PlaceDetailBase:<id>`(name/category/roadAddress),
  `PlaceMenuItem:<itemId>`(name/description/thumbnailUrl/price.displayText),
  `ROOT_QUERY.placeDetail(...).placeMenus.categories[].__ref` → `PlaceMenuCategory`의 `itemIds` 순서.
  JSON 본문은 정규식이 아니라 문자열 인식 중괄호 매칭으로 자른다(`parse-apollo.ts`).
- 실링크 검증: `npm run naver:debug -- https://naver.me/GV2k9GVb` → 경아식당 삼성코엑스점, 메뉴 15개.
- 재동기화(`/sync`)는 `(eventId, naverItemId)` upsert, **삭제 없음**(담은 사람이 있을 수 있다).
- ⚠️ 미검증: Vercel 함수 IP에서 네이버가 차단하는지. 실패해도 회식 생성은 되고(장소만 알면)
  메뉴 0개 + 직접 추가로 진행 가능하게 돼 있다. 배포 후 실제 링크로 반드시 확인할 것.

## 데이터 모델 (`src/db/schema.ts`)

`events`(slug unique) → `menus`(source naver|custom, `price` null = 가격 미정, 합계 제외)
→ `picks`(unique `(eventId, menuId, memberName)`, 수량만 바뀜, 0이면 삭제).

## 로컬 개발

```
docker compose up -d          # Postgres 17 + Neon wsproxy
cp .env.example .env.local    # 로컬 값 주석 해제
npm run db:push && npm run dev
```
