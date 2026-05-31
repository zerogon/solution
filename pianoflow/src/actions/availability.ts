"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { availabilitySchema } from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import { Role } from "@/generated/prisma/enums";

export async function adminSetTeacherAvailability(input: {
  teacherId: string;
  entries: {
    weekday: import("@/generated/prisma/enums").Weekday;
    hours: number[];
  }[];
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return { ok: false, message: "관리자 권한이 필요합니다." };
    }
    const parsed = availabilitySchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    await prisma.$transaction([
      prisma.teacherAvailability.deleteMany({
        where: { teacherId: parsed.data.teacherId },
      }),
      prisma.teacherAvailability.createMany({
        data: parsed.data.entries.map((e) => ({
          teacherId: parsed.data.teacherId,
          weekday: e.weekday,
          hours: [...e.hours].sort((a, b) => a - b),
        })),
      }),
    ]);

    revalidatePath(`/admin/teachers/${input.teacherId}/availability`);
    revalidatePath("/admin/members");
    revalidatePath("/student/book");
    revalidatePath("/admin/reservations");
    revalidatePath("/teacher/peek");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "가용 요일 저장 실패",
    };
  }
}
