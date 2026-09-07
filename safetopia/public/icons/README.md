# App Icons

이 디렉터리에는 **원본 하나**와 **생성물 여럿**이 섞여 있다.

| | 파일 | 성격 |
|---|---|---|
| 원본 | `icon.png` | 사람이 넣은 회사 로고(1254×1254, 배경 투명). **로고를 바꾼다 = 이 파일을 바꾼다.** |
| 생성물 | 그 외 전부 | `npm run icons:generate`가 굽는다. **직접 편집하지 말 것.** |

크롭 좌표·크림 배경색·모서리 비율은 `src/lib/brand-mark.ts`에 있고, 앱 안의 마크
(`src/components/app-mark.tsx`)와 생성 스크립트(`scripts/generate-icons.ts`)가 **같은
상수를 공유**한다. 사이드바 로고와 홈 화면 아이콘이 서로 다른 그림·다른 모서리가
되는 일을 막기 위한 것이다.

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
| `mark.png` | 256 | 앱 안의 `AppMark` — 엠블럼만, **배경 투명**(배경은 CSS가 칠한다) |
| `logo-lockup.png` | 512 | 로그인 화면 — 워드마크까지 포함한 전체 로고, 배경 투명 |

앞의 다섯은 크림 배경(`MARK_BG`) 위에 엠블럼을 얹은 것이고, 뒤의 둘은 배경 없이
잘라 낸 조각이다.

## 로고를 바꾸려면

1. `icon.png`를 새 로고로 교체한다(정사각, 배경 투명 권장).
2. 필요하면 `src/lib/brand-mark.ts`의 `EMBLEM_CROP`·`LOCKUP_CROP` 픽셀 좌표를 새
   이미지에 맞춘다. 색이 바뀌었으면 `MARK_BG`·`MARK_INK`와 `globals.css` 토큰도 같이.
3. `npm run icons:generate`로 PNG를 다시 굽는다.
4. `public/sw.js`의 `CACHE_VERSION`을 올린다 — `/icons/*`가 cache-first라 안 올리면
   기존 사용자에게 **옛 아이콘이 그대로 남는다**.
5. 생성된 PNG를 함께 커밋한다 — 빌드 파이프라인은 sharp를 실행하지 않는다.

`icon-maskable-512.png`만 배경이 모서리 없는 full-bleed이고 글리프가 중앙 52%로
축소돼 있다. 플랫폼이 원형·스쿼클 등 제 나름의 모양으로 잘라내기 때문이다
(안전영역 규격: <https://maskable.app/editor>).
