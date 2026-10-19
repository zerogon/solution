# App Icons

이 디렉터리는 전부 **생성물**이다. `npm run icons:generate`(`scripts/generate-icons.ts`, sharp)가
원본 한 장 `assets/brand/logo.png`(1254×1254, 배경 투명, 원 안의 고양이)에서 굽는다. **직접 편집하지 말 것.**

원본 경로·아이콘 배경색은 `src/lib/brand-mark.ts`에 있고, 앱 안의 마크(`src/components/app-mark.tsx`)와
생성 스크립트가 같은 상수를 공유한다. 원본은 1.5MB라 `public/` 밖에 둔다.

| 파일 | 크기 | 용도 |
|---|---|---|
| `icon-192.png` | 192 | `manifest.json` icons (`purpose: any`), 투명 배경 |
| `icon-512.png` | 512 | `manifest.json` icons (`purpose: any`), 투명 배경 |
| `icon-maskable-512.png` | 512 | `manifest.json` icons (`purpose: maskable`) — 배경 full-bleed, 로고는 중앙 80% |
| `apple-touch-icon.png` | 180 | iOS 홈 화면 — iOS는 투명을 검정으로 채우므로 배경을 깐다 |
| `favicon.png` | 64 | 브라우저 탭 |
| `mark.png` | 256 | 앱 안의 `AppMark`, 투명 배경 |

## 로고를 바꾸려면

1. `assets/brand/logo.png`를 새 로고로 교체한다(정사각, 배경 투명 권장).
2. `npm run icons:generate`로 PNG를 다시 굽는다.
3. `public/sw.js`의 `CACHE_VERSION`을 올린다 — `/icons/*`가 cache-first라 안 올리면
   기존 사용자에게 **옛 아이콘이 그대로 남는다**.
4. 생성된 PNG를 함께 커밋한다 — 빌드 파이프라인은 sharp를 실행하지 않는다.
