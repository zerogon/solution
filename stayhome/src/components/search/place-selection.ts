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
  "강원",
  "경기",
  "충북",
  "충남",
  "경북",
  "경남",
  "전북",
  "전남",
  "제주",
];

/** 지점 하나에 그 소속 리조트를 붙인 뷰 — 시트의 그룹 목록과 최신화 라우팅이 쓴다. */
export interface PropertyRef extends ResortProperty {
  slug: ResortSlug;
  resortName: string;
}

function allProperties(catalog: ResortCatalogEntry[]): PropertyRef[] {
  return catalog.flatMap((entry) =>
    entry.properties.map((p) => ({
      ...p,
      slug: entry.slug,
      resortName: entry.name,
    })),
  );
}

function findProperty(
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

/** 현재 리조트 선택 하에 고를 수 있는 지역들. `REGION_ORDER` 우선, 나머지는 가나다순. */
export function visibleRegions(
  sel: PlaceSelection,
  catalog: ResortCatalogEntry[],
): string[] {
  const scoped = allProperties(catalog).filter(
    (p) => sel.resort === null || p.slug === sel.resort,
  );
  return [...new Set(scoped.map((p) => p.region))].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a);
    const ib = REGION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

/**
 * 축의 점진 노출 규칙. 축은 그 축이 실제로 무언가를 분할하기 시작할 때만 나타난다.
 *
 * 롯데 단독은 리조트 1개(→ 리조트 축 무의미) · 지점 4개 / 지역 4개(→ 지역으로 나눠도
 * 지점 목록이 줄지 않으므로 지역 축도 무의미)라 둘 다 숨겨지고 화면은 지점 칩 한 줄이
 * 된다. 리조트가 늘어나면 저절로 켜진다.
 */
export function visibleAxes(catalog: ResortCatalogEntry[]): {
  resort: boolean;
  region: boolean;
} {
  const properties = allProperties(catalog);
  const regions = new Set(properties.map((p) => p.region));
  return {
    resort: catalog.length >= 2,
    region: regions.size >= 2 && properties.length > regions.size,
  };
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
