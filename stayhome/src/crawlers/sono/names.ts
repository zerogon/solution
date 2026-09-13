import type { Page } from "playwright-core";
import type { CrawlerContext } from "../types";
import { SONO, type SonoBranch } from "./config";

/**
 * 변형(`rmTypeCd`)의 화면 이름 — "스탠다드 취사/더블".
 *
 * `room/list/pc`는 변형마다 상태·잔여를 주지만 **이름을 주지 않는다**(15키에 `viewCd`만).
 * 이름은 SPA가 객실 선택 단계에서 부르는 `POST memberReservation/room/detail`에 있고,
 * 말단마다 `viewNm`·`cookNm`·`bedNm`이 붙어 온다(2026-09-13 실측, 4지점 조사 스텝 +
 * 32지점 전수 프로브).
 *
 * **이 콜은 오래 막혀 있던 콜이다.** 08-31과 09-07의 직접 호출이 전부
 * `W22M3S4 "이용회원번호는 필수입니다"`로 거절됐는데, 빠진 것은 세션도 헤더도 아니라
 * 본문의 **`actualMemNo`** 하나였다(SPA가 `memNo`와 같은 값을 싣는다). 그 필드를
 * 빼면 거절, 넣으면 저장된 쿠키만으로 새 컨텍스트에서도 열린다 — 즉 크롤러의
 * storageState로 충분하다. (`rsvBlckCd`는 SPA가 싣지만 없어도 같은 답이다.)
 *
 * 실측으로 확인한 것 넷 — 이것들이 설계를 정했다:
 *  1. **응답에 지점 코드가 없다.** `body[] > viewList[] > rmTypeList[]`이고 어느 층에도
 *     `storeCd`가 없어서, 8지점 배치의 답은 `rmTypeCd`로만 키잉할 수 있다.
 *  2. 그래도 되는 이유: 같은 `rmTypeCd`가 여러 지점에 나올 때 **뷰·취사·침대 이름은
 *     한 번도 서로 다르지 않았다**(288코드 × 32지점 × 2날짜). 어긋난 것은 전부
 *     공백 자리표시자(`" "`)와 비어 있지 않은 값의 차이였고, 그래서 병합은 칸 단위로
 *     "공백은 정보가 아니다"다. 비어 있지 않은 두 값이 다르면 그 코드는 이름을
 *     **포기**한다(`oakvalley/occupancy.ts`의 `record`와 같은 규칙).
 *  3. 커버리지: 한 날짜의 detail이 그 지점 `list/pc`의 코드 382/382를 전부 명명했고,
 *     8지점 배치가 지점별 호출의 합집합과 같은 코드를 답했다(62/62).
 *  4. 비용: 1지점 0.7초 · 8지점 1.0초. 배치당 한 번, 패스당 한 번이라 32지점이 ~4초다.
 *
 * `rmTypeNm`("패밀리(취사/스탠다드/더블)")을 그대로 쓰지 않는 이유: 행이 이미
 * 객실유형("리조트 패밀리")을 말하고, 그 문자열은 지점마다 띄어쓰기가 달랐다
 * (`"골드"` vs `"골 드"`). 라벨은 사이트 자신의 조립 규칙(`${뷰} ${취사}/${침대}`,
 * `entry.*.js`의 `gPe`)에서 객실유형만 뺀 것이다.
 */

/** `rmTypeCd` → 라벨. `null`은 "이름이 서로 달라 판정하지 않는다"이고 되돌아오지 않는다. */
export type VariantNames = ReadonlyMap<string, string | null>;

interface NameParts {
  view: string;
  cook: string;
  bed: string;
}

interface PassState {
  parts: Map<string, NameParts | null>;
  labels: Map<string, string | null>;
  /** 이미 물어본 배치(`storeCd` 목록). 답에 없던 코드 때문에 같은 배치를 다시 묻지 않는다. */
  asked: Set<string>;
}

/**
 * 패스당 한 벌. `ctx.page`로 키잉해 페이지와 함께 죽게 한다 — `oakvalley/occupancy.ts`의
 * `books`, `hanwha/search.ts`의 `booted`와 같은 이유(모듈 캐시면 다음 크롤이 죽은 브라우저의
 * 표를 물려받는다). 1박·2박 패스가 같은 페이지를 쓰므로 두 번째 숙박 길이는 0콜이다.
 */
const passes = new WeakMap<Page, PassState>();

interface DetailLeaf {
  rmTypeCd?: string | null;
  viewNm?: string | null;
  cookNm?: string | null;
  bedNm?: string | null;
}
interface DetailPayload {
  success?: boolean;
  error?: unknown;
  body?: Array<{ viewList?: Array<{ rmTypeList?: DetailLeaf[] }> }>;
}

/**
 * `codes` 중 아직 이름이 없는 것이 있으면 이 배치의 `room/detail`을 한 번 부른다.
 *
 * **절대 던지지 않는다.** `run.ts`가 검색 전체를 하나의 `withDeadline`으로 감싸므로,
 * 이름 하나 때문에 새어 나간 예외나 초과는 그 패스가 모은 **재고 행 전부**를 잃게 한다.
 * 이름이 없으면 화면에 코드가 보일 뿐이다 — 그것이 이 기능의 실패 방향이다.
 */
export async function loadVariantNames(
  ctx: CrawlerContext,
  memNo: string,
  batch: readonly SonoBranch[],
  dates: { ciYmd: string; coYmd: string; nights: number },
  codes: Iterable<string>,
): Promise<VariantNames> {
  const { page, log } = ctx;
  let state = passes.get(page);
  if (!state) {
    state = { parts: new Map(), labels: new Map(), asked: new Set() };
    passes.set(page, state);
  }

  const missing = [...new Set(codes)].filter((c) => !state.labels.has(c));
  const batchKey = batch.map((b) => b.storeCd).join(",");
  if (missing.length === 0 || state.asked.has(batchKey)) return state.labels;

  // 남은 예산에서 유도한다(한화·롯데와 같은 계보). 상한만 쓰면 느린 한 콜이
  // 부분 반환을 `DeadlineExceeded`로 바꾼다.
  const remaining = ctx.deadlineAt - Date.now();
  if (remaining < SONO.variantNames.minRemainingMs) {
    log("[sono] 변형 이름 조회 생략 — 예산 부족", { remainingMs: remaining, missing: missing.length });
    return state.labels;
  }
  state.asked.add(batchKey);

  try {
    const res = await page.request.post(
      `${SONO.apiBase}/memberReservation/room/detail?lang=ko&deviceType=PC&mobileAppYn=N`,
      {
        timeout: Math.min(SONO.timeouts.detail, remaining - SONO.variantNames.returnReserveMs),
        headers: {
          "content-type": "application/json",
          Accept: "application/json",
          Referer: SONO.bookingUrl,
        },
        data: {
          storeCdList: batch.map((b) => b.storeCd),
          memNo,
          // 이것이 없으면 `W22M3S4 이용회원번호는 필수입니다`. 위 머리말.
          actualMemNo: memNo,
          userIndCd: SONO.request.userIndCd,
          rsvIndCd: SONO.request.rsvIndCd,
          ciYmd: dates.ciYmd,
          coYmd: dates.coYmd,
          nights: dates.nights,
          rmCnt: SONO.request.rmCnt,
          adultCnt: SONO.request.adultCnt,
          childCnt: SONO.request.childCnt,
        },
      },
    );
    if (!res.ok()) throw new Error(`room/detail HTTP ${res.status()}`);
    const payload = (await res.json()) as DetailPayload;
    if (payload.success === false) {
      throw new Error(`room/detail success=false: ${JSON.stringify(payload.error).slice(0, 160)}`);
    }

    let leaves = 0;
    for (const room of payload.body ?? []) {
      for (const view of room.viewList ?? []) {
        for (const leaf of view.rmTypeList ?? []) {
          const code = leaf.rmTypeCd?.trim();
          if (!code) continue;
          leaves++;
          mergeParts(state.parts, code, {
            view: clean(leaf.viewNm),
            cook: clean(leaf.cookNm),
            bed: clean(leaf.bedNm),
          });
        }
      }
    }
    for (const [code, parts] of state.parts) state.labels.set(code, parts ? labelOf(parts) : null);
    log("[sono] 변형 이름 적재", {
      stores: batch.length,
      leaves,
      named: missing.filter((c) => state.labels.get(c) != null).length,
      missing: missing.length,
    });
  } catch (e) {
    log("[sono] 변형 이름을 읽지 못함 — 코드로 진행", {
      stores: batch.length,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return state.labels;
}

/** 사이트는 빈 칸을 `" "`로 채운다. 공백은 이름이 아니다. */
function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * 칸 단위 병합. 한쪽이 비어 있으면 다른 쪽을 쓰고, 비어 있지 않은 두 값이 다르면
 * 그 코드를 `null`로 못 박는다 — 어느 이름이 맞는지 모를 때 고르지 않는다.
 */
function mergeParts(into: Map<string, NameParts | null>, code: string, next: NameParts) {
  if (!into.has(code)) {
    into.set(code, next);
    return;
  }
  const seen = into.get(code);
  if (seen === null || seen === undefined) return;
  const merged: NameParts = { view: "", cook: "", bed: "" };
  for (const k of ["view", "cook", "bed"] as const) {
    if (seen[k] && next[k] && seen[k] !== next[k]) {
      into.set(code, null);
      return;
    }
    merged[k] = seen[k] || next[k];
  }
  into.set(code, merged);
}

/** `${뷰} ${취사}/${침대}` — 사이트의 조립 규칙에서 객실유형만 뺀 것. 전부 비면 null. */
function labelOf(p: NameParts): string | null {
  const head = [p.view, p.cook].filter(Boolean).join(" ");
  if (head && p.bed) return `${head}/${p.bed}`;
  return head || p.bed || null;
}
