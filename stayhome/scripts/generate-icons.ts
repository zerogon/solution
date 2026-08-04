/**
 * PWA 아이콘 PNG 생성기.
 *
 *   npm run icons:generate
 *
 * 마크의 기하는 `src/lib/brand-mark.ts`에서 가져온다 — 앱 안의 인라인 SVG
 * (`components/app-mark.tsx`)와 홈 화면 아이콘이 같은 그림이어야 하기 때문이다.
 * 한쪽만 바꿔서 둘이 어긋나는 것을 막으려면 반드시 그 모듈을 고치고 이 스크립트를
 * 다시 돌린다.
 *
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  MARK_BG,
  MARK_BODY,
  MARK_HIGHLIGHT,
  MARK_ROOF,
  MARK_WAVE,
} from "../src/lib/brand-mark";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/**
 * 마크 SVG를 만든다.
 *
 * @param cornerRadius 배경 모서리 반경(64 단위 기준). maskable은 0 — 플랫폼이
 *   제 나름의 모양으로 잘라내므로 배경이 정사각형 전체를 채워야 한다.
 * @param inset 글리프를 안쪽으로 밀어 넣을 비율. maskable은 안전영역(safe zone)
 *   밖이 잘려나갈 수 있어 글리프를 중앙 80%로 축소한다.
 */
function markSvg({
  cornerRadius,
  inset = 0,
}: {
  cornerRadius: number;
  inset?: number;
}): string {
  const scale = 1 - inset * 2;
  const glyph = `
    <g transform="translate(${inset * 64} ${inset * 64}) scale(${scale})">
      <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="${MARK_ROOF}" />
        <path d="${MARK_BODY}" />
        <path d="${MARK_WAVE}" opacity="0.85" />
      </g>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${cornerRadius}" fill="${MARK_BG}" />
  <path d="${MARK_HIGHLIGHT}" fill="#fff" opacity="0.08" />
  ${glyph}
</svg>`;
}

interface IconSpec {
  file: string;
  size: number;
  svg: string;
  note: string;
}

const ROUNDED = markSvg({ cornerRadius: 14 });
/** maskable: 배경 full-bleed + 글리프를 중앙 80%로 — 원형/스쿼클로 잘려도 살아남는다. */
const MASKABLE = markSvg({ cornerRadius: 0, inset: 0.1 });

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, svg: ROUNDED, note: "manifest any" },
  { file: "icon-512.png", size: 512, svg: ROUNDED, note: "manifest any" },
  { file: "icon-maskable-512.png", size: 512, svg: MASKABLE, note: "manifest maskable" },
  { file: "apple-touch-icon.png", size: 180, svg: ROUNDED, note: "iOS 홈 화면" },
  { file: "favicon.png", size: 64, svg: ROUNDED, note: "브라우저 탭" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const { file, size, svg, note } of ICONS) {
    const png = await sharp(Buffer.from(svg))
      .resize(size, size, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(OUT_DIR, file), png);
    console.log(`✓ ${file.padEnd(24)} ${String(size).padStart(3)}px  ${note}`);
  }

  console.log(`\n${ICONS.length}개 아이콘을 ${OUT_DIR}에 생성했습니다.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
