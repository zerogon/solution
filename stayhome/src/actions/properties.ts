"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { AuditAction } from "@/generated/prisma/enums";
import { branchExclusionSchema } from "@/lib/validators";
import { catalogProperties } from "@/lib/resort-catalog";

/**
 * 지점 제외의 쓰기 경로. `actions/accounts.ts`와 같은 형태
 * (세션 → zod → prisma → 감사 로그 → revalidate)이고, 다른 점 셋이 이 파일의 전부다.
 *
 * ① 되돌릴 수 없는 삭제가 딸려 있다 — 그래서 감사 로그에 **지운 행 수**를 남긴다.
 * ② 카탈로그와 대조하는 가드가 있다 — 어긋난 이름은 에러가 아니라 무동작이라,
 *    막지 않으면 "제외했는데 그대로 보인다"가 된다.
 * ③ `revalidatePath`가 둘이다 — 조회 화면(`app/(app)/page.tsx`)이 카탈로그를 읽는
 *    서버 컴포넌트라, 관리 화면만 갱신하면 제외한 칩이 라우터 캐시에 살아남는다.
 */

/** 두 액션이 함께 무효화하는 경로. 하나라도 빠지면 증상이 "고쳤는데 안 바뀐다"이다. */
function revalidateBoth() {
  revalidatePath("/admin/properties");
  revalidatePath("/");
}

export async function excludeProperty(input: unknown): Promise<{ deletedRows: number }> {
  const session = await requireSession();
  const parsed = branchExclusionSchema.parse(input);

  const resort = await prisma.resort.findUnique({
    where: { id: parsed.resortId },
    select: { id: true, slug: true, branchExclusions: { select: { branchName: true } } },
  });
  if (!resort) throw new Error("리조트를 찾을 수 없습니다");

  const properties = catalogProperties(resort.slug);

  // 가드 A — 카탈로그 대조.
  // 카탈로그에 없는 이름의 제외 행은 아무것도 걸러내지 않는 **무동작**이다. 이미 있는
  // 그런 행은 견딜 수 있고 화면이 "고아 규칙"으로 이름을 대지만, 새로 만드는 것은 다르다:
  // 오타는 드리프트가 아니라 오류이고, 여기서 막으면 "제외했는데 아무 일도 안 일어남"이
  // 침묵 대신 토스트가 된다.
  if (!properties.some((p) => p.branchName === parsed.branchName)) {
    throw new Error(
      `"${parsed.branchName}"은(는) ${resort.slug}의 지점 목록에 없습니다. ` +
        "지점 이름은 크롤러 config의 값과 문자 단위로 같아야 합니다.",
    );
  }

  // 가드 B — 마지막 지점은 뺄 수 없다.
  // 지점이 하나도 남지 않으면 그 리조트는 모든 핫 윈도우에서 영원히 0행이 되고,
  // 백스톱의 판정이 `covered === 0 → fresh:false`라 **09:00 크론에 더해 12:00 백스톱이
  // 매일 그 리조트를 재수집한다** — 아무것도 없는 것을 위해 브라우저를 하루 두 번 더 띄우고
  // `crawl_logs`에 "0행 SUCCESS"를 쌓는다. 리조트를 끄는 스위치는 이미 있고
  // (`Resort.active`), 같은 뜻의 스위치를 둘 두지 않는다.
  const after = new Set(resort.branchExclusions.map((x) => x.branchName));
  after.add(parsed.branchName);
  const live = properties.filter((p) => !after.has(p.branchName)).length;
  if (live === 0) {
    throw new Error(
      "리조트의 마지막 지점은 제외할 수 없습니다. " +
        `리조트 전체를 끄려면 npx tsx scripts/set-active.ts ${resort.slug} false 를 쓰세요.`,
    );
  }

  const [row, deleted] = await prisma.$transaction([
    prisma.resortBranchExclusion.create({
      data: {
        resortId: parsed.resortId,
        branchName: parsed.branchName,
        reason: parsed.reason ?? null,
      },
    }),
    // 즉시 삭제. 이 지점은 이제 아무도 답하지 않으므로 `removeVanishedRows`가
    // 구조적으로 닿을 수 없고(그 함수는 방금 쓴 행에서 그룹을 뽑는다), 남겨두면
    // 7일짜리 유령 청소까지 "예약 가능"을 주장한다.
    prisma.resortInventory.deleteMany({
      where: { resortId: parsed.resortId, branchName: parsed.branchName },
    }),
  ]);

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.EXCLUDE_PROPERTY,
    targetId: row.id,
    metadata: {
      resortSlug: resort.slug,
      branchName: parsed.branchName,
      reason: parsed.reason ?? null,
      // 되돌릴 수 없는 삭제의 유일한 기록. 사유가 여기 이력으로 남기 때문에
      // 제외 행에 "해제된 규칙의 사유"를 남겨둘 필요가 없다.
      deletedRows: deleted.count,
    },
  });

  revalidateBoth();
  return { deletedRows: deleted.count };
}

export async function includeProperty(resortId: string, branchName: string): Promise<void> {
  const session = await requireSession();

  // 카탈로그 대조를 하지 않는다 — 크롤러가 지점 이름을 바꾼 뒤 남은 고아 규칙을 지우는
  // 것이 정당한 사용이고, 대조로 막으면 그 정리가 불가능해진다. 가드는 **생성** 쪽에만 있다.
  const { count } = await prisma.resortBranchExclusion.deleteMany({
    where: { resortId, branchName },
  });
  if (count === 0) return;

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.INCLUDE_PROPERTY,
    targetId: resortId,
    // 재고를 복구하지 않는다는 것이 이 액션의 계약이다 — 다음 수집 전까지 그 지점은
    // 비어 있고, 화면이 그 사실을 말해야 한다(조용히 빈 지점은 크롤 실패처럼 읽힌다).
    metadata: { branchName },
  });

  revalidateBoth();
}
