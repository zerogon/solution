import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 운영자가 손으로 넣은 1박 단가 전부.
 *
 * **날짜 파라미터가 없다.** 단가는 (지점, 객실유형)의 속성이고 날짜 축이 없어서,
 * 조회 조건이 바뀌어도 같은 답이 온다 — 그래서 React Query 키가 상수(`["room-rates"]`)이고
 * 재고와 달리 조회할 때마다 다시 받지 않는다.
 *
 * **`/api/inventory`에 합쳐 넣지 않은 이유**는 서비스워커다. 그 라우트만 SWR로 캐시되는데
 * (`public/sw.js`), 요금을 거기 실으면 방금 저장한 값이 캐시본에 가려 "저장했는데 안 뜬다"가
 * 되고 그걸 피하려면 입력할 때마다 `x-fresh` 왕복을 돌려야 한다. 이 라우트는
 * `shouldBypass()`에도 SWR 목록에도 없어 그냥 네트워크로 나가므로 그 문제가 생기지 않고,
 * `/api/inventory`의 응답 shape이 그대로라 `CACHE_VERSION`도 올릴 필요가 없다.
 *
 * 행 수는 운영자가 손으로 넣은 만큼이라(수십~수백) 페이지네이션이 필요 없다.
 */
export async function GET() {
  await requireSession();

  const found = await prisma.resortRoomRate.findMany({
    orderBy: [{ branchName: "asc" }, { roomType: "asc" }],
    select: {
      branchName: true,
      roomType: true,
      perNight: true,
      note: true,
      updatedAt: true,
      resort: { select: { slug: true } },
    },
  });

  // 관계를 평평하게 편다 — `/api/inventory`가 같은 이유로 하는 일이다. 클라이언트는
  // 행을 `resortSlug`로 잇고 DB id는 볼 일이 없다(조회 화면의 카탈로그도 id를 안 받는다).
  const rates = found.map(({ resort, updatedAt, ...rate }) => ({
    ...rate,
    resortSlug: resort.slug,
    updatedAt: updatedAt.toISOString(),
  }));

  return NextResponse.json({ rates });
}
