import "server-only";

import { prisma } from "@/lib/prisma";
import { ResortSlug } from "@/generated/prisma/enums";
import { LOTTE } from "@/crawlers/lotte/config";
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
  // Phase F: 크롤러를 추가할 때 여기에 { properties } 한 항목씩 늘린다.
};

/**
 * 화면에 노출할 리조트 목록 = 카탈로그(코드가 아는 것) ∩ `Resort.active`(운영자가 켠 것).
 *
 * `listCrawlableResorts()`(`lib/inngest/targets.ts`)가 쓰는 술어와 같은 모양이다 —
 * 거기서는 "등록된 크롤러"가 코드 쪽 조건이고, 여기서는 "카탈로그 등재"가 그 역할을 한다.
 */
export async function getSearchCatalog(): Promise<ResortCatalogEntry[]> {
  const resorts = await prisma.resort.findMany({
    where: { active: true },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return resorts.flatMap((r) => {
    const entry = CATALOG[r.slug];
    if (!entry) return [];
    return [{ slug: r.slug, name: r.name, properties: entry.properties }];
  });
}
