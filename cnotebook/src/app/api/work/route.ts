import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const works = await prisma.work.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { characters: true } },
      },
    });
    return NextResponse.json(works);
  } catch (error) {
    console.error("GET /api/work error:", error);
    return NextResponse.json(
      { error: "작품 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "작품명을 입력해주세요." },
        { status: 400 }
      );
    }

    const work = await prisma.work.create({
      data: { title: title.trim() },
    });

    return NextResponse.json(work, { status: 201 });
  } catch (error) {
    console.error("POST /api/work error:", error);
    return NextResponse.json(
      { error: "작품을 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}
