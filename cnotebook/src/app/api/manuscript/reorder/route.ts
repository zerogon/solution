import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items 배열은 필수입니다." },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      items.map((item: { id: string; sortOrder: number }) =>
        prisma.manuscript.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return NextResponse.json({ message: "순서가 변경되었습니다." });
  } catch (error) {
    console.error("PATCH /api/manuscript/reorder error:", error);
    return NextResponse.json(
      { error: "순서를 변경할 수 없습니다." },
      { status: 500 }
    );
  }
}
