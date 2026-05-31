"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enrollmentPeriodSchema } from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import { Role } from "@/generated/prisma/enums";
import { parseKstDate } from "@/lib/slots";

export async function adminSetEnrollmentPeriod(input: {
  studentId: string;
  start: string | null;
  end: string | null;
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== Role.ADMIN) {
      return { ok: false, message: "관리자 권한이 필요합니다." };
    }
    const parsed = enrollmentPeriodSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.studentId },
    });
    if (!target || target.role !== Role.STUDENT) {
      return { ok: false, message: "학생을 찾을 수 없습니다." };
    }

    await prisma.user.update({
      where: { id: parsed.data.studentId },
      data: {
        enrollmentStart: parsed.data.start
          ? parseKstDate(parsed.data.start)
          : null,
        enrollmentEnd: parsed.data.end ? parseKstDate(parsed.data.end) : null,
      },
    });

    revalidatePath(`/admin/members/${parsed.data.studentId}`);
    revalidatePath("/admin/members");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "등록 기간 저장 실패",
    };
  }
}
