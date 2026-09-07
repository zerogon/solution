/**
 * PWA 아이콘 · 앱 마크 PNG 생성기.
 *
 *   npm run icons:generate
 *
 * 원본은 사람이 넣은 로고 한 장(`src/lib/brand-mark.ts`의 `LOGO_SOURCE`)이고, 여기서
 * 잘라 낸 조각을 크림 배경에 얹어 굽는다. 크롭 좌표·색·모서리 비율은 전부 그 모듈에
 * 있으며 앱 안의 마크(`components/app-mark.tsx`)도 같은 상수를 쓴다. 한쪽만 바꿔서
 * 사이드바 로고와 홈 화면 아이콘이 어긋나는 것을 막으려면 반드시 그 모듈을 고치고
 * 이 스크립트를 다시 돌린다.
 *
 * 산출물은 커밋한다(빌드 파이프라인에 sharp 의존을 추가하지 않기 위해).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  EMBLEM_CROP,
  LOCKUP_CROP,
  LOCKUP_PX,
  LOGO_SOURCE,
  MARK_BG,
  MARK_CORNER_RATIO,
  MARK_PX,
} from "../src/lib/brand-mark";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, LOGO_SOURCE);
const OUT_DIR = join(ROOT, "public", "icons");

/** 투명 배경. sharp의 resize/extend가 여백을 채울 때 쓴다. */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** 원본에서 엠블럼(또는 락업)을 잘라 지정 크기의 투명 PNG 버퍼로 만든다. */
function cutout(crop: typeof EMBLEM_CROP, size: number): Promise<Buffer> {
  return sharp(SRC)
    .extract(crop)
    .resize(size, size, { fit: "contain", background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * 크림 라운드 사각형 배경.
 *
 * @param cornerRadius 모서리 반경(px). maskable은 0 — 플랫폼이 제 나름의 모양으로
 *   잘라내므로 배경이 정사각형 전체를 채워야 한다.
 */
function background(size: number, cornerRadius: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${MARK_BG}" />
</svg>`,
  );
}

interface IconSpec {
  file: string;
  size: number;
  /** 글리프가 캔버스에서 차지하는 비율. */
  glyph: number;
  /** true면 모서리 없는 full-bleed 배경. */
  fullBleed?: boolean;
  note: string;
}

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, glyph: 0.68, note: "manifest any" },
  { file: "icon-512.png", size: 512, glyph: 0.68, note: "manifest any" },
  // maskable: 배경 full-bleed + 글리프를 중앙 52%로 — 원형/스쿼클로 잘려도 살아남는다.
  { file: "icon-maskable-512.png", size: 512, glyph: 0.52, fullBleed: true, note: "manifest maskable" },
  { file: "apple-touch-icon.png", size: 180, glyph: 0.68, note: "iOS 홈 화면" },
  // 파비콘은 탭에서 16px까지 줄어든다. 불꽃 노치가 뭉개지지 않게 글리프를 조금 크게.
  { file: "favicon.png", size: 64, glyph: 0.74, note: "브라우저 탭" },
];

async function bakeIcon({ size, glyph, fullBleed }: IconSpec): Promise<Buffer> {
  const glyphPx = Math.round(size * glyph);
  const emblem = await cutout(EMBLEM_CROP, glyphPx);
  const radius = fullBleed ? 0 : Math.round(size * MARK_CORNER_RATIO);

  return sharp(background(size, radius))
    .composite([{ input: emblem, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const spec of ICONS) {
    writeFileSync(join(OUT_DIR, spec.file), await bakeIcon(spec));
    console.log(`✓ ${spec.file.padEnd(24)} ${String(spec.size).padStart(3)}px  ${spec.note}`);
  }

  // 배경 없는 조각 둘 — 앱이 CSS로 배경·크기를 입힌다.
  writeFileSync(join(OUT_DIR, "mark.png"), await cutout(EMBLEM_CROP, MARK_PX));
  console.log(`✓ ${"mark.png".padEnd(24)} ${String(MARK_PX).padStart(3)}px  앱 마크(투명)`);

  writeFileSync(join(OUT_DIR, "logo-lockup.png"), await cutout(LOCKUP_CROP, LOCKUP_PX));
  console.log(`✓ ${"logo-lockup.png".padEnd(24)} ${String(LOCKUP_PX).padStart(3)}px  로그인 전체 로고(투명)`);

  console.log(`\n${ICONS.length + 2}개 아이콘을 ${OUT_DIR}에 생성했습니다.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
