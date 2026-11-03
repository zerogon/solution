import { MOBILE_UA } from "./resolve-place";
import { extractApolloState, parseMenuPage, type ParsedMenuPage } from "./parse-apollo";

export class NaverFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "NaverFetchError";
  }
}

/** 식당이 아닌 업종(카페 등)은 `/restaurant/` 경로가 비어 있을 수 있어 `/place/`로 한 번 더 시도한다. */
const PATH_TYPES = ["restaurant", "place"] as const;

async function fetchHtml(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, {
    headers: {
      "user-agent": MOBILE_UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return { status: res.status, html: res.ok ? await res.text() : "" };
}

/**
 * placeId의 메뉴 페이지를 받아 파싱한다.
 * 장소 정보조차 못 읽으면 throw, 장소는 있는데 메뉴가 0개면 그대로 반환(호출자가 빈 상태로 처리).
 */
export async function fetchPlaceMenus(placeId: string): Promise<ParsedMenuPage> {
  let lastStatus = 0;
  let best: ParsedMenuPage | null = null;

  for (const type of PATH_TYPES) {
    const url = `https://m.place.naver.com/${type}/${placeId}/menu/list`;
    const { status, html } = await fetchHtml(url);
    lastStatus = status;
    if (!html) continue;

    const state = extractApolloState(html);
    if (!state) continue;

    const page = parseMenuPage(state, placeId);
    if (page.menus.length > 0 && page.place) return page;
    if (page.place && !best) best = page;
  }

  if (best) return best;
  throw new NaverFetchError(
    lastStatus && lastStatus !== 200
      ? `네이버 응답이 비정상입니다 (HTTP ${lastStatus}).`
      : "네이버 페이지에서 장소 정보를 읽지 못했습니다.",
    lastStatus || undefined,
  );
}
