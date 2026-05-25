/**
 * PWA 아이콘 생성 - 피아노 건반 디자인
 */
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve(__dirname, "..", "public", "icons");

const BG = "#0f172a"; // slate-900 (theme color)
const KEY_WHITE = "#f8fafc"; // slate-50
const KEY_DIVIDER = "#94a3b8"; // slate-400
const KEY_BLACK = "#020617"; // slate-950
const HIGHLIGHT = "#1e293b"; // slate-800 (top inset shadow)

interface KeyboardOpts {
  /** Total canvas size in viewBox units (square) */
  size: number;
  /** Keyboard width as fraction of canvas (0..1) */
  width: number;
  /** Aspect ratio of keyboard (height / width) */
  aspect: number;
  /** Background corner radius (0 for maskable full-bleed) */
  bgRadius: number;
}

function pianoSvg({ size, width, aspect, bgRadius }: KeyboardOpts): string {
  const kbW = size * width;
  const kbH = kbW * aspect;
  const kbX = (size - kbW) / 2;
  const kbY = (size - kbH) / 2;

  const whiteW = kbW / 7;
  const blackW = whiteW * 0.6;
  const blackH = kbH * 0.6;
  // Black keys live at white-key boundaries 1, 2, 4, 5, 6 (skip 3 = E-F)
  const blackBoundaries = [1, 2, 4, 5, 6];
  const blackKeys = blackBoundaries
    .map((i) => kbX + i * whiteW - blackW / 2)
    .map(
      (x) =>
        `<rect x="${x.toFixed(2)}" y="${kbY.toFixed(2)}" width="${blackW.toFixed(
          2,
        )}" height="${blackH.toFixed(2)}" rx="${(blackW * 0.12).toFixed(
          2,
        )}" fill="${KEY_BLACK}"/>`,
    )
    .join("");

  const dividers = [1, 2, 3, 4, 5, 6]
    .map((i) => kbX + i * whiteW)
    .map(
      (x) =>
        `<line x1="${x.toFixed(2)}" y1="${(kbY + kbH * 0.04).toFixed(
          2,
        )}" x2="${x.toFixed(2)}" y2="${(kbY + kbH * 0.97).toFixed(
          2,
        )}" stroke="${KEY_DIVIDER}" stroke-width="${(kbW * 0.005).toFixed(2)}"/>`,
    )
    .join("");

  const keyRadius = kbW * 0.025;
  const topShadowH = kbH * 0.06;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${bgRadius}" fill="${BG}"/>
  <rect x="${kbX.toFixed(2)}" y="${kbY.toFixed(2)}" width="${kbW.toFixed(2)}" height="${kbH.toFixed(
    2,
  )}" rx="${keyRadius.toFixed(2)}" fill="${KEY_WHITE}"/>
  ${dividers}
  <rect x="${kbX.toFixed(2)}" y="${kbY.toFixed(2)}" width="${kbW.toFixed(
    2,
  )}" height="${topShadowH.toFixed(2)}" rx="${keyRadius.toFixed(2)}" fill="${HIGHLIGHT}"/>
  ${blackKeys}
</svg>`;
}

async function build(name: string, size: number, opts: Omit<KeyboardOpts, "size">) {
  const svg = pianoSvg({ size, ...opts });
  const out = path.join(OUT_DIR, name);
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log(`✓ ${name} (${size}x${size})`);
}

async function main() {
  // Regular icons: rounded-rect background, keyboard fills ~72% of canvas.
  const REGULAR = { width: 0.72, aspect: 0.7, bgRadius: 0.18 };
  await build("icon-192.png", 192, { ...REGULAR, bgRadius: 192 * REGULAR.bgRadius });
  await build("icon-512.png", 512, { ...REGULAR, bgRadius: 512 * REGULAR.bgRadius });

  // Maskable: full-bleed background, keyboard inside the inner 80% safe zone.
  await build("icon-maskable-512.png", 512, { width: 0.6, aspect: 0.7, bgRadius: 0 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
