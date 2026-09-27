# PWA Icons

**이 디렉터리의 PNG는 생성물이다. 직접 편집하지 말 것.**

원본은 `assets/brand/logo.png` **한 장**이다(1254px 고양이 일러스트, 2026-09-27). 앱 안의
로고(`src/components/app-mark.tsx` → `logo-256.png`)와 여기 PNG, `src/app/favicon.ico`가
전부 그 원본에서 구워진다. 원본은 1.5MB라 `public/` 밖에 둔다.

## 재생성

```bash
npm run icons:generate     # scripts/generate-icons.ts (sharp)
```

산출물:

| 파일 | 크기 | 용도 |
|---|---|---|
| `icon-192.png` | 192 | `manifest.json` icons (`purpose: any`) |
| `icon-512.png` | 512 | `manifest.json` icons (`purpose: any`) |
| `icon-maskable-512.png` | 512 | `manifest.json` icons (`purpose: maskable`) |
| `apple-touch-icon.png` | 180 | iOS 홈 화면 (`metadata.icons.apple`) |
| `favicon.png` | 64 | 브라우저 탭 (`metadata.icons.icon`) |
| `logo-256.png` | 256 | 앱 안 로고 (`AppMark`) |
| `src/app/favicon.ico` | 16·32·48 | `/favicon.ico` (PNG 엔트리 ICO) |

## 로고를 바꾸려면

1. `assets/brand/logo.png`를 교체한다(정사각형, 투명 배경 권장).
2. `npm run icons:generate`로 다시 굽는다.
3. `public/sw.js`의 `CACHE_VERSION`을 올린다 — `/icons/*`는 cache-first라 안 올리면
   설치된 기기가 옛 아이콘을 계속 쓴다.
4. 생성물을 함께 커밋한다 — 빌드 파이프라인은 sharp를 실행하지 않는다.

`icon-maskable-512.png`와 `apple-touch-icon.png`만 배경(`#FAFCFD`, manifest의
`background_color`)이 깔려 있다. maskable은 플랫폼이 원형·스쿼클로 잘라내므로 로고가 중앙
80%에 들어가고(안전영역: <https://maskable.app/editor>), iOS는 투명을 검정으로 채운다.
