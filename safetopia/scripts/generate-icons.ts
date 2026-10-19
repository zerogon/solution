/**
 * PWA 아이콘 · 앱 마크 PNG 생성기.
 *
 *   npm run icons:generate
 *
 * 원본은 사람이 넣은 로고 한 장(`src/lib/brand-mark.ts`의 `LOGO_SOURCE`)이다. 앱 안의 마크
 * (`components/app-mark.tsx`)와 홈 화면 아이콘이 같은 그림이어야 하므로 모든 산출물을
 * 그 원본 하나에서 굽는다. 로고를 바꾸면 이 스크립트를 다시 돌리고 `public/sw.js`의
 * `CACHE_VERSION`을 올린다 — `/icons/*`는 cache-first라 안 올리면 설치된 기기가 옛 아이콘을 계속 쓴다.
 *
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { ICON_BG, LOGO_SOURCE, MARK_PX } from "../src/lib/brand-mark";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public", "icons");

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * 원본을 `size` 정사각형에 굽는다.
 *
 * @param padding 한 변 대비 여백 비율. maskable은 0.1 — 플랫폼이 원형·스쿼클로 잘라내므로
 *   로고를 중앙 80% 안전영역에 넣는다.
 * @param background 없으면 투명. iOS(apple-touch-icon)는 투명을 검정으로 채우므로 배경을 깐다.
 */
async function render(
  source: Buffer,
  size: number,
  { padding = 0, background }: { padding?: number; background?: string } = {},
): Promise<Buffer> {
  const inner = Math.round(size * (1 - padding * 2));
  const logo = await sharp(source)
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT, kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? TRANSPARENT },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

interface IconSpec {
  file: string;
  size: number;
  padding?: number;
  background?: string;
  note: string;
}

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, note: "manifest any" },
  { file: "icon-512.png", size: 512, note: "manifest any" },
  { file: "icon-maskable-512.png", size: 512, padding: 0.1, background: ICON_BG, note: "manifest maskable" },
  { file: "apple-touch-icon.png", size: 180, padding: 0.06, background: ICON_BG, note: "iOS 홈 화면" },
  { file: "favicon.png", size: 64, note: "브라우저 탭" },
  { file: "mark.png", size: MARK_PX, note: "앱 안 마크 (AppMark)" },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const source = readFileSync(join(ROOT, LOGO_SOURCE));

  for (const { file, size, padding, background, note } of ICONS) {
    writeFileSync(join(OUT_DIR, file), await render(source, size, { padding, background }));
    console.log(`✓ ${file.padEnd(24)} ${String(size).padStart(3)}px  ${note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
