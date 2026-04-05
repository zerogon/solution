import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const manuscript = await prisma.manuscript.findUnique({
      where: { id },
      include: { work: true },
    });

    if (!manuscript) {
      return NextResponse.json(
        { error: "원고를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(manuscript);
  } catch (error) {
    console.error("GET /api/manuscript/[id] error:", error);
    return NextResponse.json(
      { error: "원고를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.manuscript.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "원고를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.workId !== undefined) {
      const workIdRaw = body.workId;
      const newWorkId =
        typeof workIdRaw === "string" && workIdRaw.trim() !== ""
          ? workIdRaw.trim()
          : null;
      if (newWorkId) {
        const work = await prisma.work.findUnique({ where: { id: newWorkId } });
        if (!work) {
          return NextResponse.json(
            { error: "존재하지 않는 작품입니다." },
            { status: 404 }
          );
        }
      }
      updateData.workId = newWorkId;
    }

    const manuscript = await prisma.manuscript.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(manuscript);
  } catch (error) {
    console.error("PATCH /api/manuscript/[id] error:", error);
    return NextResponse.json(
      { error: "원고를 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.manuscript.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "원고를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.manuscript.delete({ where: { id } });

    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/manuscript/[id] error:", error);
    return NextResponse.json(
      { error: "원고를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
