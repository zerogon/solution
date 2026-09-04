"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { AuditAction, type ResortSlug } from "@/generated/prisma/enums";
import { roomRateKeySchema, roomRateSchema } from "@/lib/validators";

/**
 * 수동 1박 단가의 쓰기 경로. `actions/properties.ts`와 같은 형태
 * (세션 → zod → prisma → 감사 로그 → revalidate)이고, 다른 점 셋이 이 파일의 전부다.
 *
 * ① **슬러그로 리조트를 찾는다.** 주 호출부가 조회 화면인데 거기 내려가는 카탈로그에는
 *    DB id가 없다(`getSearchCatalog()`). id를 내려보내게 만드는 대신 여기서 조회한다.
 * ② **카탈로그 가드가 없다.** 객실유형에는 대조할 정답지가 없고(사이트가 정한다),
 *    이름이 어긋난 요금 행은 아무것도 붙이지 않는 **무동작**이다. 대신 입력 다이얼로그가
 *    항상 실제 조회 행에서 열려 사람이 타이핑하지 않는다 — 오타가 생길 자리 자체가 없다.
 * ③ **`revalidatePath("/")`를 하지 않는다.** `properties.ts`가 그것을 부르는 이유는
 *    조회 화면의 지점 칩이 **서버 렌더 props**이기 때문인데, 요금은 클라이언트가
 *    `/api/room-rates`로 받는다. 여기서 `/`를 무효화해도 아무 일도 일어나지 않는다 —
 *    실제 갱신 수단은 호출부의 `invalidateQueries(["room-rates"])`뿐이다.
 */

/** 슬러그 → 리조트 id. 없으면 던진다(액션의 에러 메시지가 곧 토스트 문구다). */
async function resortIdOf(slug: ResortSlug): Promise<string> {
  const resort = await prisma.resort.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!resort) throw new Error(`리조트 ${slug}을(를) 찾을 수 없습니다`);
  return resort.id;
}

/**
 * 1박 단가를 저장한다(없으면 생성, 있으면 갱신).
 *
 * 생성과 수정을 한 액션·한 감사 항목으로 접는다 — 운영자에게 둘은 같은 동작이고
 * (칸에 숫자를 넣는다) upsert가 그것을 자연스럽게 표현한다. 대신 **이전 값을 감사
 * 로그에 남긴다**: 안 남기면 "8만원이 12만원이 된 사건"이 어디에도 기록되지 않는다.
 * `excludeProperty`가 되돌릴 수 없는 `deletedRows`를 남기는 것과 같은 판단이다.
 */
export async function setRoomRate(input: unknown): Promise<{ created: boolean }> {
  const session = await requireSession();
  const parsed = roomRateSchema.parse(input);
  const resortId = await resortIdOf(parsed.resortSlug);

  const key = {
    resortId_branchName_roomType: {
      resortId,
      branchName: parsed.branchName,
      roomType: parsed.roomType,
    },
  };

  const before = await prisma.resortRoomRate.findUnique({
    where: key,
    select: { perNight: true },
  });

  const row = await prisma.resortRoomRate.upsert({
    where: key,
    create: {
      resortId,
      branchName: parsed.branchName,
      roomType: parsed.roomType,
      perNight: parsed.perNight,
      note: parsed.note ?? null,
    },
    update: { perNight: parsed.perNight, note: parsed.note ?? null },
  });

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.SET_ROOM_RATE,
    targetId: row.id,
    metadata: {
      resortSlug: parsed.resortSlug,
      branchName: parsed.branchName,
      roomType: parsed.roomType,
      perNight: parsed.perNight,
      // 수정이면 이전 값, 생성이면 null. 이 칸이 없으면 금액이 바뀐 사실 자체가 남지 않는다.
      prevPerNight: before?.perNight ?? null,
      note: parsed.note ?? null,
    },
  });

  revalidatePath("/admin/rates");
  return { created: before == null };
}

/**
 * 1박 단가를 지운다.
 *
 * 행이 사라지므로 `targetId`만으로는 나중에 아무것도 복원할 수 없다 — 그래서 감사
 * metadata에 키 세 값과 지워진 금액을 **전부** 남긴다.
 */
export async function deleteRoomRate(input: unknown): Promise<void> {
  const session = await requireSession();
  const parsed = roomRateKeySchema.parse(input);
  const resortId = await resortIdOf(parsed.resortSlug);

  const row = await prisma.resortRoomRate.findUnique({
    where: {
      resortId_branchName_roomType: {
        resortId,
        branchName: parsed.branchName,
        roomType: parsed.roomType,
      },
    },
    select: { id: true, perNight: true, note: true },
  });
  // 무동작은 기록하지 않는다 (`includeProperty`의 `count === 0` 조기 return과 같다).
  if (!row) return;

  await prisma.resortRoomRate.delete({ where: { id: row.id } });

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.DELETE_ROOM_RATE,
    targetId: row.id,
    metadata: {
      resortSlug: parsed.resortSlug,
      branchName: parsed.branchName,
      roomType: parsed.roomType,
      perNight: row.perNight,
      note: row.note,
    },
  });

  revalidatePath("/admin/rates");
}
