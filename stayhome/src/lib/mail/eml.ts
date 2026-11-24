/**
 * Outlook에서 "보내기 전 새 메일"로 열리는 .eml 만들기.
 *
 * `X-Unsent: 1`이 그 동작을 만든다. 이미지는 `multipart/related`의 인라인 파트로 싣고
 * 본문은 `cid:`로 가리킨다 — data URL은 Outlook이 그리지 않는다.
 * 전부 브라우저 안에서 끝나고 서버로 올라가는 것이 없다.
 */

export interface EmlImage {
  /** data URL */
  dataUrl: string;
  name: string;
}

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

function splitDataUrl(u: string): { type: string; b64: string } | null {
  const m = u.match(/^data:([^;]+);base64,(.*)$/);
  return m ? { type: m[1], b64: m[2] } : null;
}

/** 헤더에 줄바꿈이 섞이면 헤더가 하나 더 생긴다 — 받는 사람 칸은 사람이 치는 값이다. */
const headerSafe = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * @param buildHtml 이미지마다 받은 `cid:` 주소로 본문을 만든다. 입력 순서와 같은 순서로 온다.
 */
export function buildEml(opts: {
  subject: string;
  to: string;
  images: EmlImage[];
  buildHtml: (cids: string[]) => string;
}): string {
  const parts = opts.images.flatMap((img, i) => {
    const split = splitDataUrl(img.dataUrl);
    return split ? [{ ...split, id: `img${i + 1}@resort`, name: img.name, index: i }] : [];
  });
  const cids = opts.images.map((_, i) => {
    const p = parts.find((x) => x.index === i);
    return p ? `cid:${p.id}` : "";
  });
  const html = `<html><head><meta charset="utf-8"></head><body>${opts.buildHtml(cids)}</body></html>`;
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const to = headerSafe(opts.to);

  let e = "X-Unsent: 1\r\n";
  if (to) e += `To: ${to}\r\n`;
  e += `Subject: =?UTF-8?B?${b64utf8(opts.subject)}?=\r\n`;
  e += `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"; type="text/html"\r\n\r\n`;
  e += `--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64utf8(html))}\r\n`;
  for (const p of parts) {
    e += `--${boundary}\r\nContent-Type: ${p.type}; name="${p.name}"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${p.id}>\r\nContent-Disposition: inline; filename="${p.name}"\r\n\r\n${wrap76(p.b64)}\r\n`;
  }
  e += `--${boundary}--\r\n`;
  return e;
}
