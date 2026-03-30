import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const work = await prisma.work.findUnique({
      where: { id },
      include: {
        _count: { select: { characters: true } },
      },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(work);
  } catch (error) {
    console.error("GET /api/work/[id] error:", error);
    return NextResponse.json(
      { error: "작품을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "작품명을 입력해주세요." },
        { status: 400 }
      );
    }

    const work = await prisma.work.findUnique({ where: { id } });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (work.deletedAt) {
      return NextResponse.json(
        { error: "휴지통에 있는 작품은 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const updated = await prisma.work.update({
      where: { id },
      data: { title: title.trim() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/work/[id] error:", error);
    return NextResponse.json(
      { error: "작품을 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

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

    await prisma.work.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ message: "작품이 휴지통으로 이동되었습니다." });
  } catch (error) {
    console.error("DELETE /api/work/[id] error:", error);
    return NextResponse.json(
      { error: "작품을 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
