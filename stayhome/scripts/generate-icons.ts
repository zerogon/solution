/**
 * PWA 아이콘 · 파비콘 · 앱 안 로고 PNG 생성기.
 *
 *   npm run icons:generate
 *
 * 원본은 `assets/brand/logo.png` **한 장**이다(2026-09-27 고양이 로고). 앱 안의 로고
 * (`components/app-mark.tsx` → `logo-256.png`)와 홈 화면 아이콘이 같은 그림이어야 하므로
 * 모든 산출물을 그 원본 하나에서 굽는다. 로고를 바꾸려면 원본을 교체하고 이 스크립트를
 * 다시 돌린 뒤 `public/sw.js`의 `CACHE_VERSION`을 올린다 — `/icons/*`는 cache-first라
 * 안 올리면 설치된 기기가 옛 아이콘을 계속 쓴다.
 *
 * 원본을 `public/` 밖에 두는 이유: 1.5MB라 공개 URL로 서비스할 물건이 아니다.
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "assets", "brand", "logo.png");
const OUT_DIR = join(ROOT, "public", "icons");
const FAVICON_ICO = join(ROOT, "src", "app", "favicon.ico");

/** `manifest.json`의 `background_color`와 같은 값. */
const BG = "#FAFCFD";
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
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();
}

/**
 * PNG 엔트리로 된 ICO를 조립한다. sharp는 ICO를 쓰지 못하고, Vista 이후 모든 브라우저가
 * PNG 엔트리를 읽는다. 구조: ICONDIR(6B) + ICONDIRENTRY(16B)×n + PNG 본문들.
 */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
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
  { file: "icon-maskable-512.png", size: 512, padding: 0.1, background: BG, note: "manifest maskable" },
  { file: "apple-touch-icon.png", size: 180, padding: 0.06, background: BG, note: "iOS 홈 화면" },
  { file: "favicon.png", size: 64, note: "브라우저 탭" },
  { file: "logo-256.png", size: 256, note: "앱 안 로고 (AppMark)" },
];

async function main() {
  const source = readFileSync(SOURCE);

  for (const { file, size, padding, background, note } of ICONS) {
    writeFileSync(join(OUT_DIR, file), await render(source, size, { padding, background }));
    console.log(`✓ ${file.padEnd(24)} ${String(size).padStart(3)}px  ${note}`);
  }

  const ico = buildIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(source, size) }))),
  );
  writeFileSync(FAVICON_ICO, ico);
  console.log(`✓ ${"src/app/favicon.ico".padEnd(24)} 16·32·48  /favicon.ico`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
