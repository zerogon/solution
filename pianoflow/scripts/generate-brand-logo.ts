/**
 * 브랜드 로고 / 앱 아이콘 생성 — art'i piano
 *
 * 원본: public/logo_tmp.png (검정 글자 + 투명 배경, ≈2.2:1 가로형)
 *   - 피아노 건반 마크 + "art'i piano" 워드마크 + "Play your sound with" 태그라인
 *
 * 생성물(모두 신규 파일, 기존 파일은 건드리지 않음):
 *   public/logo.png                    전체 로고 trim (밝은 배경용)
 *   public/logo-white.png              흰색 틴트 버전 (어두운 배경용)
 *   public/icons/app-icon-192.png      워드마크(태그라인 제거) 흰 배경 정사각형
 *   public/icons/app-icon-512.png      〃
 *   public/icons/app-icon-maskable-512.png  흰 풀블리드 + 안전영역 워드마크
 *   public/icons/icon-mark.png         건반 마크만, 흰 배경 (소형 썸네일용)
 *   public/icons/favicon.png           건반 마크만, 64px 흰 배경 (파비콘)
 */
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public", "logo_tmp.png");
const APP_SRC = path.join(ROOT, "public", "app.png"); // 앱 아이콘 소스 (스택형 워드마크)
const WEB_SRC = path.join(ROOT, "public", "web-logo.png"); // 상단바 가로 로고 소스
const PUB = path.join(ROOT, "public");
const ICONS = path.join(PUB, "icons");

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** 태그라인("Play your sound with")만 지운 워드마크 버퍼. 건반·"art'i piano"는 보존. */
async function eraseTagline(): Promise<Buffer> {
  const { data, info } = await sharp(SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  // 태그라인은 본문 우측 하단(x>=450, y>=385)에만 존재 — 건반(x<=430)·"piano"(y<=363)와 겹치지 않음.
  for (let y = 385; y < height; y++) {
    for (let x = 450; x < width; x++) {
      data[(y * width + x) * channels + 3] = 0;
    }
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/** 투명 에셋을 흰 배경 정사각형(N×N) 중앙에 innerFrac 비율로 배치. */
async function squareOnWhite(input: Buffer, N: number, innerFrac: number): Promise<Buffer> {
  const inner = Math.round(N * innerFrac);
  const fitted = await sharp(input)
    .resize({ width: inner, height: inner, fit: "inside" })
    .png()
    .toBuffer();
  return sharp({ create: { width: N, height: N, channels: 4, background: WHITE } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
}

async function write(buf: Buffer, file: string) {
  await sharp(buf).png().toFile(file);
  const { width, height } = await sharp(buf).metadata();
  console.log(`✓ ${path.relative(ROOT, file)} (${width}x${height})`);
}

async function main() {
  // 전체 로고 (태그라인 포함) — 투명 여백만 잘라낸 가로형 로고
  const fullTrim = await sharp(SRC).trim().png().toBuffer();
  await write(fullTrim, path.join(PUB, "logo.png"));

  // 흰색 틴트 (검정→흰색, 알파 유지) — 어두운 배경용
  const fullWhite = await sharp(fullTrim).negate({ alpha: false }).png().toBuffer();
  await write(fullWhite, path.join(PUB, "logo-white.png"));

  // 워드마크 (태그라인 제거) → 흰 배경 정사각 앱 아이콘 + 투명 standalone
  const wordmark = await sharp(await eraseTagline()).trim().png().toBuffer();
  await write(wordmark, path.join(PUB, "logo-wordmark.png"));
  // 어두운 표면용 흰색 틴트 워드마크
  await write(
    await sharp(wordmark).negate({ alpha: false }).png().toBuffer(),
    path.join(PUB, "logo-wordmark-white.png"),
  );
  // ── 상단바용: web-logo에서 태그라인("Play your sound with") 제거 ──
  // web-logo.png(416×103): 워드마크 y12–67, 태그라인 y80–95. 사이 여백(68–79)에서 잘라 워드마크만 남김.
  const webMeta = await sharp(WEB_SRC).metadata();
  const webNoTag = await sharp(WEB_SRC)
    .extract({ left: 0, top: 0, width: webMeta.width, height: 74 })
    .png()
    .toBuffer();
  await write(webNoTag, path.join(PUB, "web-logo-notag.png"));

  // ── 앱 아이콘 전체는 app.png 기반 ──
  // app.png는 반투명 흰 배경 → 흰색으로 평탄화 후, (새 파이프라인) trim으로 여백 제거.
  // sharp는 한 파이프라인에서 trim을 다른 연산보다 먼저 적용하므로 flatten→buffer→trim 으로 분리.
  const appFlat = await sharp(APP_SRC).flatten({ background: WHITE }).png().toBuffer();
  const appAsset = await sharp(appFlat).trim().png().toBuffer();

  await write(await squareOnWhite(appAsset, 192, 0.84), path.join(ICONS, "app-icon-192.png"));
  await write(await squareOnWhite(appAsset, 512, 0.84), path.join(ICONS, "app-icon-512.png"));
  // maskable: 안전영역(내부) 안에 더 작게
  await write(await squareOnWhite(appAsset, 512, 0.62), path.join(ICONS, "app-icon-maskable-512.png"));
  // 설치 썸네일 / 알림 배지 / 파비콘도 app.png로 통일
  await write(await squareOnWhite(appAsset, 512, 0.84), path.join(ICONS, "icon-mark.png"));
  await write(await squareOnWhite(appAsset, 64, 0.9), path.join(ICONS, "favicon.png"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
