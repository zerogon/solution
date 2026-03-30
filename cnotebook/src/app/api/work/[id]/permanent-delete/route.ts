import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const work = await prisma.work.findUnique({ where: { id } });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.work.delete({ where: { id } });

    return NextResponse.json({ message: "작품이 영구 삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/work/[id]/permanent-delete error:", error);
    return NextResponse.json(
      { error: "작품을 영구 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
