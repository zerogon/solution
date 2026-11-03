/**
 * 네이버 링크 → placeId.
 *
 * 지원 형태:
 *   https://naver.me/GV2k9GVb                       (단축 — Location 헤더로 1단계 해석)
 *   https://map.naver.com/p/entry/place/1435982635  (지도 공유)
 *   https://map.naver.com/v5/entry/place/1435982635
 *   https://m.place.naver.com/restaurant/1435982635/home
 *   https://place.naver.com/restaurant/1435982635
 *   https://pcmap.place.naver.com/restaurant/1435982635
 * 그리고 위 호스트 아래 `?placePath=`, `#` 등 어떤 꼬리가 붙어도 id만 뽑는다.
 */

export class NaverLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverLinkError";
  }
}

const ID_RE =
  /\/(?:entry\/place|restaurant|place|cafe|accommodation|hairshop|hospital|beauty|shopping)\/(\d{5,})/;

export function extractPlaceId(url: string): string | null {
  const m = url.match(ID_RE);
  return m ? m[1] : null;
}

function normalizeInput(raw: string): URL {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new NaverLinkError("올바른 URL이 아닙니다.");
  }
  if (!/(^|\.)naver\.(me|com)$/.test(u.hostname)) {
    throw new NaverLinkError("네이버 링크만 지원합니다.");
  }
  return u;
}

/** 단축 링크는 리다이렉트를 따라가지 않고 Location 헤더만 읽는다 (map.naver.com 본문은 필요 없다). */
async function expandShortLink(u: URL): Promise<string> {
  const res = await fetch(u, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
    headers: { "user-agent": MOBILE_UA },
  });
  const location = res.headers.get("location");
  if (!location) {
    throw new NaverLinkError(`단축 링크를 해석하지 못했습니다 (HTTP ${res.status}).`);
  }
  return new URL(location, u).toString();
}

export const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function resolvePlaceId(raw: string): Promise<{ placeId: string; resolvedUrl: string }> {
  const u = normalizeInput(raw);
  let target = u.toString();
  if (u.hostname === "naver.me") target = await expandShortLink(u);

  const placeId = extractPlaceId(target);
  if (!placeId) {
    throw new NaverLinkError("링크에서 장소 ID를 찾지 못했습니다. 네이버 지도의 '공유' 링크를 붙여넣어 주세요.");
  }
  return { placeId, resolvedUrl: target };
}
