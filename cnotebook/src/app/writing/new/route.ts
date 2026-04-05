import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const maxOrder = await prisma.manuscript.aggregate({
      where: { workId: null },
      _max: { sortOrder: true },
    });

    const created = await prisma.manuscript.create({
      data: {
        workId: null,
        title: "제목 없음",
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.redirect(
      new URL(`/writing/${created.id}`, request.url)
    );
  } catch (error) {
    console.error("GET /writing/new error:", error);
    return NextResponse.redirect(new URL("/writing", request.url));
  }
}
