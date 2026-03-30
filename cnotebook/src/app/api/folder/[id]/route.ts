import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "폴더명을 입력해주세요." },
        { status: 400 }
      );
    }

    const existing = await prisma.folder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "폴더를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const folder = await prisma.folder.update({
      where: { id },
      data: { name: name.trim() },
    });

    return NextResponse.json(folder);
  } catch (error) {
    console.error("PATCH /api/folder/[id] error:", error);
    return NextResponse.json(
      { error: "폴더를 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.folder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "폴더를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.folder.delete({ where: { id } });

    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/folder/[id] error:", error);
    return NextResponse.json(
      { error: "폴더를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
