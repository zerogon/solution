import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get("workId");

    if (workId) {
      const manuscripts = await prisma.manuscript.findMany({
        where: { workId },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json(manuscripts);
    }

    const manuscripts = await prisma.manuscript.findMany({
      where: {
        OR: [{ workId: null }, { work: { deletedAt: null } }],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        work: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(manuscripts);
  } catch (error) {
    console.error("GET /api/manuscript error:", error);
    return NextResponse.json(
      { error: "원고 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const workIdRaw = body?.workId;
    const titleRaw = body?.title;

    const workId =
      typeof workIdRaw === "string" && workIdRaw.trim() !== ""
        ? workIdRaw.trim()
        : null;
    const title =
      typeof titleRaw === "string" && titleRaw.trim() !== ""
        ? titleRaw.trim()
        : "제목 없음";

    if (workId) {
      const work = await prisma.work.findUnique({ where: { id: workId } });
      if (!work) {
        return NextResponse.json(
          { error: "존재하지 않는 작품입니다." },
          { status: 404 }
        );
      }
    }

    const maxOrder = await prisma.manuscript.aggregate({
      where: workId ? { workId } : { workId: null },
      _max: { sortOrder: true },
    });

    const manuscript = await prisma.manuscript.create({
      data: {
        workId,
        title,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json(manuscript, { status: 201 });
  } catch (error) {
    console.error("POST /api/manuscript error:", error);
    return NextResponse.json(
      { error: "원고를 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}
