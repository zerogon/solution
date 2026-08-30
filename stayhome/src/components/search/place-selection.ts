import type { ResortSlug } from "@/generated/prisma/enums";
import type {
  InventoryRow,
  ResortCatalogEntry,
  ResortProperty,
} from "./types";

/**
 * 장소 필터의 상태와 그 위에서 도는 순수 함수들.
 *
 * 세 축(리조트·지역·지점)은 서로 독립이 아니다. 상위 축을 바꾸면 하위 축의 값이
 * 모순될 수 있고, 지점을 고르면 상위 두 축은 그 지점의 값으로 결정된다. 그 정합성을
 * 컴포넌트의 이벤트 핸들러에 흩어 놓는 대신 아래 `select*` 세 함수에 모아 둔다 —
 * 무효 조합(리조트=롯데 + 지역=제주 + 지점=속초)이 애초에 상태로 존재할 수 없게 하는
 * 것이고, `StayRangeCalendar`가 `{from, to: undefined}`를 만들지 않는 것과 같은 판단이다.
 */
export interface PlaceSelection {
  resort: ResortSlug | null;
  region: string | null;
  /** 단일 지점 = `ResortInventory.branchName`. 설정되면 위 두 축은 이 지점의 값으로 고정된다. */
  property: string | null;
}

/**
 * 축별 예약 가능 건수 — 칩과 목록 행의 숫자.
 *
 * **각 축은 자기 자신을 뺀 나머지 축으로 스코프해서 센다**(표준 패싯 카운트).
 * 계산은 `SearchView`에 있고 규칙의 이유도 거기 적혀 있다 — 요약하면, 리조트가
 * 서버 축이던 시절에는 `rows`가 이미 그 리조트만 담아서 지역 배지가 저절로
 * 스코프됐지만, 이제 `rows`가 항상 전 리조트를 담으므로 그 공짜가 사라졌다.
 */
export interface PlaceCounts {
  byProperty: Record<string, number>;
  byRegion: Record<string, number>;
  byResort: Partial<Record<ResortSlug, number>>;
}

export const ALL_PLACES: PlaceSelection = {
  resort: null,
  region: null,
  property: null,
};

/**
 * 지역 칩 정렬 순서. 행정구역 나열 관례(북→남)를 따르고, 여기 없는 지역은 뒤에
 * 가나다순으로 붙는다. 카탈로그(`lib/resort-catalog.ts`)가 아니라 여기 있는 이유는
 * 그쪽이 `server-only`라 클라이언트 컴포넌트가 읽을 수 없기 때문이다.
 */
export const REGION_ORDER: readonly string[] = [
  // 한화의 더플라자 호텔 하나 때문에 생겼다. 리조트가 네 곳일 때까지 이 목록은
  // 전부 휴양지였고, 서울은 그 예외의 첫 사례다.
  "서울",
  "강원",
  "경기",
  "충북",
  "충남",
  "경북",
  "경남",
  // 소노문·팔라티움 해운대가 들어오면서 필요해졌다. 목록에 없어도 에러는 아니고
  // `visibleRegions`가 뒤로 가나다순 배치할 뿐이지만, "부산"이 "제주" 뒤는 어색하다.
  "부산",
  "전북",
  "전남",
  "제주",
];

/** 지점 하나에 그 소속 리조트를 붙인 뷰 — 시트의 그룹 목록과 최신화 라우팅이 쓴다. */
export interface PropertyRef extends ResortProperty {
  slug: ResortSlug;
  resortName: string;
}

/**
 * 카탈로그의 모든 지점. **검색이 이걸 본다** — 칩으로 좁힌 범위가 아니라.
 * 이름을 쳐서 찾는 사람에게 "지금 지역 칩이 제주라서 안 나옵니다"는 침묵이고,
 * 이 저장소가 가장 싫어하는 실패 방향이다(증상이 "필터를 눌렀는데 0건"과 같다).
 */
export function allProperties(catalog: ResortCatalogEntry[]): PropertyRef[] {
  return catalog.flatMap((entry) =>
    entry.properties.map((p) => ({
      ...p,
      slug: entry.slug,
      resortName: entry.name,
    })),
  );
}

/** 이름으로 지점 하나. 지목된 지점의 리조트명·지역을 알아야 하는 곳들이 쓴다. */
export function findProperty(
  catalog: ResortCatalogEntry[],
  branchName: string,
): PropertyRef | null {
  return allProperties(catalog).find((p) => p.branchName === branchName) ?? null;
}

// ---------- 축 전이 ----------

/** 리조트를 바꾼다. 새 리조트에 속하지 않는 지점/지역 선택은 버린다. */
export function selectResort(
  sel: PlaceSelection,
  slug: ResortSlug | null,
  catalog: ResortCatalogEntry[],
): PlaceSelection {
  if (slug === null) return { ...sel, resort: null };

  const entry = catalog.find((e) => e.slug === slug);
  const regions = new Set(entry?.properties.map((p) => p.region) ?? []);
  const keepProperty =
    sel.property != null &&
    entry?.properties.some((p) => p.branchName === sel.property) === true;

  return {
    resort: slug,
    region: sel.region != null && regions.has(sel.region) ? sel.region : null,
    property: keepProperty ? sel.property : null,
  };
}

/** 지역을 바꾼다. 그 지역에 없는 지점 선택은 버린다. 리조트 선택은 유지. */
export function selectRegion(
  sel: PlaceSelection,
  region: string | null,
  catalog: ResortCatalogEntry[],
): PlaceSelection {
  if (region === null) return { ...sel, region: null };

  const current = sel.property ? findProperty(catalog, sel.property) : null;
  return {
    ...sel,
    region,
    property: current?.region === region ? sel.property : null,
  };
}

/** 지점을 고른다. 상위 두 축은 그 지점의 값으로 채워 넣는다(모순 불가). */
export function selectProperty(
  sel: PlaceSelection,
  branchName: string | null,
  catalog: ResortCatalogEntry[],
): PlaceSelection {
  if (branchName === null) return { ...sel, property: null };

  const target = findProperty(catalog, branchName);
  if (!target) return sel;

  return { resort: target.slug, region: target.region, property: branchName };
}

// ---------- 파생 ----------

/** 리조트 ∩ 지역으로 좁힌 지점 후보. 지점 축의 렌더 대상이자 요약 스탯의 분모. */
export function candidateProperties(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): PropertyRef[] {
  return allProperties(catalog).filter(
    (p) =>
      (sel.resort === null || p.slug === sel.resort) &&
      (sel.region === null || p.region === sel.region),
  );
}

/**
 * 지역 정렬 비교자. `REGION_ORDER` 우선, 목록에 없는 지역은 뒤로 가나다순.
 *
 * 지역이 두 곳에서 줄지어 나오므로(지역 칩 줄 · 펼친 리조트 그룹 안의 소제목) 비교자를
 * 하나로 둔다. 사본을 만들면 두 목록의 순서가 어긋나고, 증상이 에러가 아니라
 * "칩은 강원→경기인데 소제목은 가나다순"이라는 조용한 불일치다.
 */
export function compareRegions(a: string, b: string): number {
  const ia = REGION_ORDER.indexOf(a);
  const ib = REGION_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, "ko");
}

/** 현재 리조트 선택 하에 고를 수 있는 지역들. */
export function visibleRegions(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): string[] {
  const scoped = allProperties(catalog).filter(
    (p) => sel.resort === null || p.slug === sel.resort,
  );
  return [...new Set(scoped.map((p) => p.region))].sort(compareRegions);
}

/**
 * 축의 점진 노출 규칙. 축은 그 축이 실제로 무언가를 분할할 때만 나타난다.
 *
 * ⚠️ **`resort`가 켜는 것은 더 이상 칩 줄이 아니다**(2026-08-30 2차). 팝업의 리조트 칩
 * 줄은 지웠고, 지금 이 값이 켜는 것은 목록의 **리조트 그룹 껍데기**(접기 헤더 +
 * `{리조트} 전체` 행)다. 리조트가 한 곳이면 헤더는 정보가 0이고 `{리조트} 전체`는
 * 맨 위 범위 행과 같은 뜻이 되므로, 둘 다 그리지 않고 지점 행만 남긴다.
 *
 * 조건이 한 번 느슨해졌다(2026-08-30). 종전 지역 조건은
 * `regions.size >= 2 && properties.length > regions.size`였는데, 뒤쪽 항은
 * **필터 패널의 세로 지면이 비쌌기 때문에** 있던 것이다. 지금 축들은 장소 팝업
 * 안에 있어 결과 지면을 뺏지 않으므로 "나눌 수 있으면 켠다"로 충분하다.
 *
 * 대신 **현재 선택 기준**으로 판정한다. 리조트를 고르면 지역이 하나로 줄 수 있고
 * (오크밸리는 강원 하나뿐이다), 그때 지역 칩 줄은 `전체`와 `강원` 둘뿐인 무의미한
 * 줄이 된다.
 */
export function visibleAxes(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): {
  resort: boolean;
  region: boolean;
} {
  return {
    resort: catalog.length >= 2,
    region: visibleRegions(sel, catalog).length >= 2,
  };
}

/**
 * 칩이 뜻하는 것은 "이 범위를 훑는다"이지 "이 조건을 더한다"가 아니다.
 *
 * `selectRegion`은 지점의 지역이 일치하면 지점 선택을 **유지한다** — 그 자체는
 * 옳다(모순이 아니니까). 그런데 팝업의 칩에 그대로 쓰면 "설악 쏘라노가 고정된
 * 상태에서 강원 칩"이 **아무 일도 하지 않는다**. 눌렀는데 화면이 그대로인 것은
 * 이 저장소가 가장 싫어하는 실패 방향이고, 에러도 안 난다.
 *
 * 그래서 `select*`를 고치지 않고 합성으로 만든다. 백필 불변식(지점을 고르면 상위
 * 두 축이 그 지점 값으로 채워진다)에 `candidateProperties`·`placeLabel`·
 * `AvailabilitySummary`의 분모가 전부 서 있어서, 그쪽은 건드리면 안 된다.
 */
export function browseResort(
  sel: PlaceSelection,
  slug: ResortSlug | null,
  catalog: ResortCatalogEntry[],
): PlaceSelection {
  return selectResort(selectProperty(sel, null, catalog), slug, catalog);
}

export function browseRegion(
  sel: PlaceSelection,
  region: string | null,
  catalog: ResortCatalogEntry[],
): PlaceSelection {
  return selectRegion(selectProperty(sel, null, catalog), region, catalog);
}

/** 선택이 비어 있는가 — 해제 버튼의 노출 조건. */
export function isAllPlaces(sel: PlaceSelection): boolean {
  return sel.resort === null && sel.region === null && sel.property === null;
}

/**
 * 지점을 지목하지 않고 **지금 좁혀 놓은 범위 그대로** 끝낼 때의 이름.
 *
 * 팝업 목록 첫 행이 이 문구를 단다. 그 행이 있어야 "칩 = 좁히기 / 행 = 확정·닫힘"
 * 규칙이 예외 없이 완결된다 — 없으면 지역만 고르는 사람은 백드롭 클릭으로 끝내야
 * 하는데, 그건 다이얼로그 관용구상 "취소"인 제스처다.
 */
export function scopeLabel(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): string {
  const resortName = sel.resort
    ? (catalog.find((e) => e.slug === sel.resort)?.name ?? null)
    : null;
  if (resortName && sel.region) return `${resortName} · ${sel.region} 전체`;
  if (resortName) return `${resortName} 전체`;
  if (sel.region) return `${sel.region} 전체`;
  return "전체 지점";
}

/**
 * 결과 행이 현재 선택에 걸리는지.
 *
 * 지역·리조트 판정을 카탈로그가 아니라 **행 자신의 값**으로 한다. 크롤러가 나중에
 * 지역을 사이트에서 파싱하도록 바뀌어 카탈로그와 어긋나도, "칩에 건수는 떠 있는데
 * 눌러도 안 나오는" 상태가 생기지 않는다.
 */
export function matchesPlace(row: InventoryRow, sel: PlaceSelection): boolean {
  if (sel.property !== null) return row.branchName === sel.property;
  if (sel.resort !== null && row.resortSlug !== sel.resort) return false;
  if (sel.region !== null && row.region !== sel.region) return false;
  return true;
}

/**
 * 라이브 최신화 대상. **지점이 선택된 경우에만** 존재한다.
 *
 * `POST /api/resorts/[slug]/refresh`는 `maxDuration=60`의 단일 호출이고 내부
 * `runResortCrawl`은 50초 예산 안에서 브라우저 한 세션을 돌린다. 지점이 10곳
 * 넘는 리조트(한화·소노)에 "리조트 전체 최신화"를 붙이면 검색 전체에 걸린
 * `withDeadline`이 터져 0행 FAILED가 된다. 여러 리조트 동시 최신화는 호출 1건 =
 * 브라우저 1세션이라 애초에 불가능하다.
 */
export function refreshTarget(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): PropertyRef | null {
  return sel.property ? findProperty(catalog, sel.property) : null;
}

/** 요약 줄의 조건 배지 문구. */
export function placeLabel(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): string {
  if (sel.property) {
    const p = findProperty(catalog, sel.property);
    return p ? `${p.resortName} · ${p.label}` : sel.property;
  }
  const resortName = sel.resort
    ? (catalog.find((e) => e.slug === sel.resort)?.name ?? null)
    : null;
  if (resortName && sel.region) return `${resortName} · ${sel.region}`;
  if (resortName) return resortName;
  if (sel.region) return sel.region;
  return "전체 지점";
}
