import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const character = await prisma.character.findUnique({
      where: { id },
      include: {
        work: true,
        folders: { include: { folder: true } },
      },
    });

    if (!character) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(character);
  } catch (error) {
    console.error("GET /api/character/[id] error:", error);
    return NextResponse.json(
      { error: "캐릭터를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const { workId: _workId, id: _id, createdAt: _c, updatedAt: _u, work: _w, folders: _f, ...updateData } = body;

    if (updateData.age !== undefined) updateData.age = updateData.age ? Number(updateData.age) : null;
    if (updateData.height !== undefined) updateData.height = updateData.height ? Number(updateData.height) : null;
    if (updateData.weight !== undefined) updateData.weight = updateData.weight ? Number(updateData.weight) : null;

    const character = await prisma.character.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(character);
  } catch (error) {
    console.error("PATCH /api/character/[id] error:", error);
    return NextResponse.json(
      { error: "캐릭터를 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "캐릭터를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    await prisma.character.delete({ where: { id } });

    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    console.error("DELETE /api/character/[id] error:", error);
    return NextResponse.json(
      { error: "캐릭터를 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
