import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const work = await prisma.work.findUnique({ where: { id } });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (!work.deletedAt) {
      return NextResponse.json(
        { error: "이미 복원된 작품입니다." },
        { status: 400 }
      );
    }

    await prisma.work.update({
      where: { id },
      data: { deletedAt: null },
    });

    return NextResponse.json({ message: "작품이 복원되었습니다." });
  } catch (error) {
    console.error("POST /api/work/[id]/restore error:", error);
    return NextResponse.json(
      { error: "작품을 복원할 수 없습니다." },
      { status: 500 }
    );
  }
}
