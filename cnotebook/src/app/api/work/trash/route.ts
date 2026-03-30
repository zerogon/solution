import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await prisma.work.deleteMany({
      where: {
        deletedAt: { not: null, lt: thirtyDaysAgo },
      },
    });

    const works = await prisma.work.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: {
        _count: { select: { characters: true } },
      },
    });

    return NextResponse.json(works);
  } catch (error) {
    console.error("GET /api/work/trash error:", error);
    return NextResponse.json(
      { error: "휴지통 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
