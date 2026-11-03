/**
 * 네이버 링크 → 메뉴 파싱을 실링크로 확인한다.
 *
 *   npm run naver:debug -- https://naver.me/GV2k9GVb
 */
import { fetchPlaceMenus, resolvePlaceId } from "../src/lib/naver";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("사용법: npm run naver:debug -- <네이버 링크>");
    process.exit(1);
  }
  const t0 = Date.now();
  const { placeId, resolvedUrl } = await resolvePlaceId(url);
  console.log(`placeId=${placeId}\nresolved=${resolvedUrl}`);
  const page = await fetchPlaceMenus(placeId);
  console.log(`place=${JSON.stringify(page.place)}`);
  console.log(`menus=${page.menus.length} (${Date.now() - t0}ms)`);
  for (const m of page.menus) {
    console.log(
      `  [${m.sortOrder}] ${m.name} | ${m.priceText ?? "-"} → ${m.price ?? "null"}` +
        `${m.categoryName ? ` | ${m.categoryName}` : ""}${m.imageUrl ? " | img" : ""}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
