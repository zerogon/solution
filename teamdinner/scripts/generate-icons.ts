/**
 * PWA 아이콘·앱 로고 PNG 생성기.   npm run icons:generate
 *
 * 원본은 `scripts/assets/logo.jpeg`(녹색 배경 펭귄, 447×447). 서빙되지 않는 생성 전용 파일이다.
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해). 원본을 바꾸면 다시 돌린다.
 *
 * - 둥근 모서리(반지름 22%) 버전: 홈 화면 "any" 아이콘·애플 터치·파비콘. 모서리는 투명.
 * - maskable: 마스크 없이 full-bleed. 펭귄이 원본의 중앙 약 48%×63%에 있어 안전영역(80%)을 이미 만족한다.
 * - logo-256: 앱 안 로고(`components/app-mark.tsx`). 둥근 모서리는 CSS가 처리하므로 정사각 그대로.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "scripts", "assets", "logo.jpeg");
const OUT_DIR = join(ROOT, "public", "icons");

/** 모서리 반지름 비율. 예전 SVG 마크의 rx=14/64 ≈ 0.22 와 같다. */
const CORNER_RATIO = 0.22;

interface IconSpec {
  file: string;
  size: number;
  rounded: boolean;
  note: string;
}

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, rounded: true, note: "manifest any" },
  { file: "icon-512.png", size: 512, rounded: true, note: "manifest any" },
  { file: "icon-maskable-512.png", size: 512, rounded: false, note: "manifest maskable (full-bleed)" },
  { file: "apple-touch-icon.png", size: 180, rounded: true, note: "iOS 홈 화면" },
  { file: "favicon.png", size: 64, rounded: true, note: "브라우저 탭" },
  { file: "logo-256.png", size: 256, rounded: false, note: "앱 안 로고 (CSS가 모서리 처리)" },
];

function roundedMask(size: number): Buffer {
  const r = Math.round(size * CORNER_RATIO);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`,
  );
}

async function render({ size, rounded }: IconSpec): Promise<Buffer> {
  // 원본(447px)보다 큰 크기는 약간의 업스케일 — lanczos3 로 최대한 부드럽게.
  let img = sharp(SOURCE).resize(size, size, { fit: "cover", kernel: "lanczos3" });
  if (rounded) {
    img = img.composite([{ input: roundedMask(size), blend: "dest-in" }]);
  }
  return img.png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const spec of ICONS) {
    const png = await render(spec);
    writeFileSync(join(OUT_DIR, spec.file), png);
    console.log(`✓ ${spec.file.padEnd(24)} ${String(spec.size).padStart(3)}px  ${spec.note}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
