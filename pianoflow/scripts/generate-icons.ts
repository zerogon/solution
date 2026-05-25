/**
 * PWA 아이콘 placeholder 생성
 * 실제 디자인이 정해지면 이 파일들을 교체하세요.
 */
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve(__dirname, "..", "public", "icons");
const BG = "#0f172a"; // 슬레이트-900
const FG = "#fafafa";

function svgForSize(size: number, padding: number): string {
  const inner = size - padding * 2;
  const fontSize = Math.round(inner * 0.5);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${BG}"/>
  <text x="50%" y="50%" font-family="-apple-system, system-ui, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="${FG}"
        text-anchor="middle" dominant-baseline="central">PF</text>
</svg>`;
}

async function build(name: string, size: number, padding: number) {
  const out = path.join(OUT_DIR, name);
  await sharp(Buffer.from(svgForSize(size, padding)))
    .png()
    .toFile(out);
  console.log(`✓ ${name} (${size}x${size})`);
}

async function main() {
  await build("icon-192.png", 192, 0);
  await build("icon-512.png", 512, 0);
  // Maskable: 안전 영역 80% (테두리 10% 패딩)
  await build("icon-maskable-512.png", 512, 52);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
