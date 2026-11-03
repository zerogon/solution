/**
 * PWA 아이콘 PNG 생성기.   npm run icons:generate
 * 마크 기하는 `src/lib/brand-mark.ts` — 앱 인라인 SVG와 같은 그림이어야 한다.
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  MARK_BG,
  MARK_BOWL,
  MARK_FOOT,
  MARK_HIGHLIGHT,
  MARK_STICK_A,
  MARK_STICK_B,
} from "../src/lib/brand-mark";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

function markSvg({ cornerRadius, inset = 0 }: { cornerRadius: number; inset?: number }): string {
  const scale = 1 - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${cornerRadius}" fill="${MARK_BG}" />
  <path d="${MARK_HIGHLIGHT}" fill="#fff" opacity="0.08" />
  <g transform="translate(${inset * 64} ${inset * 64}) scale(${scale})">
    <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="${MARK_STICK_A}" />
      <path d="${MARK_STICK_B}" />
      <path d="${MARK_BOWL}" fill="#fff" fill-opacity="0.18" />
      <path d="${MARK_FOOT}" opacity="0.85" />
    </g>
  </g>
</svg>`;
}

const ROUNDED = markSvg({ cornerRadius: 14 });
/** maskable: 배경 full-bleed + 글리프를 중앙 80%로 — 원형/스쿼클로 잘려도 살아남는다. */
const MASKABLE = markSvg({ cornerRadius: 0, inset: 0.1 });

const ICONS = [
  { file: "icon-192.png", size: 192, svg: ROUNDED, note: "manifest any" },
  { file: "icon-512.png", size: 512, svg: ROUNDED, note: "manifest any" },
  { file: "icon-maskable-512.png", size: 512, svg: MASKABLE, note: "manifest maskable" },
  { file: "apple-touch-icon.png", size: 180, svg: ROUNDED, note: "iOS 홈 화면" },
  { file: "favicon.png", size: 64, svg: ROUNDED, note: "브라우저 탭" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { file, size, svg, note } of ICONS) {
    const png = await sharp(Buffer.from(svg)).resize(size, size, { fit: "fill" }).png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(OUT_DIR, file), png);
    console.log(`✓ ${file.padEnd(24)} ${String(size).padStart(3)}px  ${note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
