import "server-only";

import { prisma } from "@/lib/prisma";
import { ResortSlug } from "@/generated/prisma/enums";
import { HANWHA } from "@/crawlers/hanwha/config";
import { LOTTE } from "@/crawlers/lotte/config";
import { OAKVALLEY } from "@/crawlers/oakvalley/config";
import { RESOM } from "@/crawlers/resom/config";
import { SONO } from "@/crawlers/sono/config";
import type { ResortCatalogEntry, ResortProperty } from "@/components/search/types";

/**
 * 조회 화면이 쓰는 리조트·지점 목록의 단일 출처.
 *
 * **클라이언트 컴포넌트에서 import 금지** — `server-only`가 빌드 타임에 막는다.
 * 크롤러 config에는 `bizCd`(예약 API 프로퍼티 코드)와 로그인 셀렉터가 들어 있고,
 * 예전에는 `BranchTabs`가 `LOTTE`를 직접 import하는 바람에 그게 브라우저 번들까지
 * 실려 나갔다. 서버 컴포넌트(`app/(app)/page.tsx`)가 `getSearchCatalog()`를 호출해
 * 아래 shape만 props로 내려보낸다.
 *
 * 지점 메타를 DB 테이블(`ResortProperty`)로 두지 않은 이유: `ResortInventory.branchName`은
 * 크롤러가 `LOTTE.branches[].value`를 그대로 저장한 값이다(`parse.ts` → `run.ts`의
 * `upsertInventory`). 테이블을 만들면 같은 리스트의 사본이 하나 더 생기고, 사본이
 * 어긋났을 때의 증상은 "필터를 눌렀는데 0건" — 크롤 실패와 구분이 안 된다.
 * 여기서는 UI가 읽는 배열과 크롤러가 도는 배열이 동일 객체라 그 드리프트가 없다.
 *
 * **그래서 DB에 두는 것은 목록이 아니라 목록에서 빼는 규칙이다** (2026-08-29).
 * `ResortBranchExclusion`은 `(resortId, branchName)` 한 쌍이고 **행이 있으면 제외 ·
 * 없으면 노출**이라, 이 표는 카탈로그에서 뺄 수만 있고 더할 수 없다. 이름이 어긋난
 * 행은 아무것도 걸러내지 않는 **무동작**이고, 그 실패 방향은 위에서 거부한 드리프트와
 * 정확히 반대쪽이다 — "지점이 사라짐"이 아니라 **"지점이 그대로 보임"**이다.
 * 다만 그 무동작은 조용하므로 두 곳에서 이름을 대게 만든다: ① `excludeProperty`
 * (`actions/properties.ts`)가 생성 시 `CATALOG`와 대조해 거부하고, ②
 * `/admin/properties`가 카탈로그에 없는 제외 행을 "고아 규칙"으로 따로 그린다
 * (`getPropertyAdminCatalog`의 `orphanExclusions`).
 */
const CATALOG: Partial<Record<ResortSlug, { properties: ResortProperty[] }>> = {
  // `value`가 곧 `ResortInventory.branchName`이라는 사실이 이 매핑에 드러난다.
  // bizCd는 여기서 떨어져 나간다.
  [ResortSlug.LOTTE]: {
    properties: LOTTE.branches.map((b) => ({
      branchName: b.value,
      label: b.label,
      region: b.region,
    })),
  },
  // storeCd는 bizCd와 같은 이유로 여기서 떨어져 나간다.
  [ResortSlug.SONO]: {
    properties: SONO.branches.map((b) => ({
      branchName: b.value,
      label: b.label,
      region: b.region,
    })),
  },
  // condoCd도 같은 이유로 여기서 떨어져 나간다.
  [ResortSlug.RESOM]: {
    properties: RESOM.branches.map((b) => ({
      branchName: b.value,
      label: b.label,
      region: b.region,
    })),
  },
  // complexCd도 같은 이유로 여기서 떨어져 나간다.
  [ResortSlug.OAKVALLEY]: {
    properties: OAKVALLEY.branches.map((b) => ({
      branchName: b.value,
      label: b.label,
      region: b.region,
    })),
  },
  // brchCd/locCd도 같은 이유로 여기서 떨어져 나간다 — 그 둘은 쌍이 어긋나면
  // 사이트가 에러가 아니라 0행으로 답하는 값이라 더더욱 크롤러 밖으로 나가면 안 된다.
  [ResortSlug.HANWHA]: {
    properties: HANWHA.branches.map((b) => ({
      branchName: b.value,
      label: b.label,
      region: b.region,
    })),
  },
  // Phase F: 크롤러를 추가할 때 여기에 { properties } 한 항목씩 늘린다.
};

/**
 * 화면에 노출할 리조트 목록 = 카탈로그(코드가 아는 것) ∩ `Resort.active`(운영자가 켠 것)
 * − `ResortBranchExclusion`(운영자가 뺀 지점).
 *
 * `listCrawlableResorts()`(`lib/inngest/targets.ts`)가 쓰는 술어와 같은 모양이다 —
 * 거기서는 "등록된 크롤러"가 코드 쪽 조건이고, 여기서는 "카탈로그 등재"가 그 역할을 한다.
 */
export async function getSearchCatalog(): Promise<ResortCatalogEntry[]> {
  const resorts = await prisma.resort.findMany({
    where: { active: true },
    select: {
      slug: true,
      name: true,
      branchExclusions: { select: { branchName: true } },
    },
    orderBy: { name: "asc" },
  });

  return resorts.flatMap((r) => {
    const entry = CATALOG[r.slug];
    if (!entry) return [];

    const excluded = new Set(r.branchExclusions.map((x) => x.branchName));
    const properties =
      excluded.size === 0
        ? entry.properties
        : entry.properties.filter((p) => !excluded.has(p.branchName));

    // 지점이 0곳이 된 리조트는 통째로 뺀다. `excludeProperty`가 그 상태를 만들지
    // 못하게 막지만 직접 SQL이나 CATALOG 축소로는 도달할 수 있고, 남겨두면
    // `visibleAxes`가 이 리조트를 축 계산에 세고 눌러도 0건인 칩이 생긴다.
    if (properties.length === 0) return [];

    return [{ slug: r.slug, name: r.name, properties }];
  });
}

/**
 * 한 리조트가 코드상 아는 지점 전부. 제외는 **적용하지 않는다.**
 *
 * `excludeProperty`의 카탈로그 대조 가드가 쓴다 — 카탈로그에 없는 이름의 제외 규칙은
 * 견딜 수 있는 무동작이지만, 오타는 무동작이 아니라 오류다. 여기서 막으면 "제외했는데
 * 아무 일도 안 일어남"이 토스트가 된다.
 */
export function catalogProperties(slug: ResortSlug): readonly ResortProperty[] {
  return CATALOG[slug]?.properties ?? [];
}

/** `/admin/properties`가 그리는 지점 한 줄. */
export interface AdminProperty extends ResortProperty {
  excluded: boolean;
  /** 제외 사유. 제외되지 않은 지점은 항상 null. */
  reason: string | null;
  /** 지금 이 지점이 갖고 있는 `resort_inventory` 행 수. 제외하면 지워질 숫자다. */
  inventoryRows: number;
}

/** `/admin/properties`가 그리는 리조트 한 장. */
export interface AdminCatalogEntry {
  resortId: string;
  slug: ResortSlug;
  name: string;
  /** `Resort.active`. 제외와는 다른 스위치라 화면이 둘을 같이 보여준다. */
  active: boolean;
  properties: AdminProperty[];
  /**
   * `CATALOG`에 대응 지점이 없는 제외 행 — 이 설계에서 유일하게 조용한 실패다.
   *
   * 크롤러가 지점 이름을 바꾸면 옛 이름의 제외 규칙은 아무것도 걸러내지 않게 되고,
   * 그 지점이 조회 화면에 말없이 돌아온다. 막을 수는 없으니 이름을 대게 만든다.
   */
  orphanExclusions: Array<{ branchName: string; reason: string | null }>;
}

/**
 * 관리 화면용 전체 목록. `getSearchCatalog()`와 달리 **아무것도 숨기지 않는다** —
 * 비활성 리조트도, 제외된 지점도 그대로 들어간다.
 *
 * `Resort.active`와 지점 제외는 다른 스위치이고, 하나를 다른 하나 뒤에 숨기면
 * "왜 이 지점이 안 보이지"의 답이 두 화면으로 갈린다.
 */
export async function getPropertyAdminCatalog(): Promise<AdminCatalogEntry[]> {
  const [resorts, counts] = await Promise.all([
    prisma.resort.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        branchExclusions: { select: { branchName: true, reason: true } },
      },
      orderBy: { name: "asc" },
    }),
    // 제외 다이얼로그가 추상어("재고가 지워집니다") 대신 실제 숫자를 말하게 하려고 센다.
    prisma.resortInventory.groupBy({
      by: ["resortId", "branchName"],
      _count: { _all: true },
    }),
  ]);

  const rowCount = new Map<string, number>();
  for (const c of counts) {
    rowCount.set(`${c.resortId}\u0000${c.branchName}`, c._count._all);
  }

  return resorts.flatMap((r) => {
    const entry = CATALOG[r.slug];
    if (!entry) return [];

    const reasons = new Map(r.branchExclusions.map((x) => [x.branchName, x.reason]));
    const properties = entry.properties.map((p) => ({
      ...p,
      excluded: reasons.has(p.branchName),
      reason: reasons.get(p.branchName) ?? null,
      inventoryRows: rowCount.get(`${r.id}\u0000${p.branchName}`) ?? 0,
    }));

    const known = new Set(entry.properties.map((p) => p.branchName));
    const orphanExclusions = r.branchExclusions
      .filter((x) => !known.has(x.branchName))
      .map((x) => ({ branchName: x.branchName, reason: x.reason }));

    return [
      {
        resortId: r.id,
        slug: r.slug,
        name: r.name,
        active: r.active,
        properties,
        orphanExclusions,
      },
    ];
  });
}
