# PWA Icons

**이 디렉터리의 PNG는 생성물이다. 직접 편집하지 말 것.**

아이콘 그림(지붕 + 물결)은 `src/lib/brand-mark.ts`에 경로/색상 상수로 정의돼 있고,
앱 안의 인라인 SVG(`src/components/app-mark.tsx`)와 여기 PNG가 **같은 상수를 공유**한다.

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

## 마크를 바꾸려면

1. `src/lib/brand-mark.ts`의 경로/색 상수를 수정한다.
2. `npm run icons:generate`로 PNG를 다시 굽는다.
3. 생성된 PNG를 함께 커밋한다 — 빌드 파이프라인은 sharp를 실행하지 않는다.

`icon-maskable-512.png`만 배경이 모서리 없는 full-bleed이고 글리프가 중앙 80%로
축소돼 있다. 플랫폼이 원형·스쿼클 등 제 나름의 모양으로 잘라내기 때문이다
(안전영역 규격: <https://maskable.app/editor>).
