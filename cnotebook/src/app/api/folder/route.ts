import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get("workId");

    if (!workId) {
      return NextResponse.json(
        { error: "workId는 필수입니다." },
        { status: 400 }
      );
    }

    const folders = await prisma.folder.findMany({
      where: { workId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { characters: true } },
      },
    });

    return NextResponse.json(folders);
  } catch (error) {
    console.error("GET /api/folder error:", error);
    return NextResponse.json(
      { error: "폴더 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workId, name } = body;

    if (!workId || !name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "workId와 폴더명은 필수입니다." },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.create({
      data: { workId, name: name.trim() },
    });

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("POST /api/folder error:", error);
    return NextResponse.json(
      { error: "폴더를 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}
