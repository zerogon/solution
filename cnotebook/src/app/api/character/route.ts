import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get("workId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "name";
    const order = searchParams.get("order") || "asc";
    const folderId = searchParams.get("folderId");

    const where: Prisma.CharacterWhereInput = workId
      ? { workId }
      : { work: { deletedAt: null } };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { aliases: { contains: search, mode: "insensitive" } },
        { personality: { contains: search, mode: "insensitive" } },
        { features: { contains: search, mode: "insensitive" } },
        { affiliation: { contains: search, mode: "insensitive" } },
        { region: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    if (folderId) {
      where.folders = { some: { folderId } };
    }

    const validSortFields = ["name", "age", "gender"];
    const sortField = validSortFields.includes(sort) ? sort : "name";
    const sortOrder = order === "desc" ? "desc" : "asc";

    const characters = await prisma.character.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      include: {
        folders: { include: { folder: true } },
        work: workId ? false : { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(characters);
  } catch (error) {
    console.error("GET /api/character error:", error);
    return NextResponse.json(
      { error: "캐릭터 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workId, name, ...rest } = body;

    if (!workId || !name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "workId와 이름은 필수입니다." },
        { status: 400 }
      );
    }

    const work = await prisma.work.findUnique({ where: { id: workId } });
    if (!work) {
      return NextResponse.json(
        { error: "존재하지 않는 작품입니다." },
        { status: 404 }
      );
    }

    const character = await prisma.character.create({
      data: {
        workId,
        name: name.trim(),
        role: rest.role || null,
        gender: rest.gender || null,
        birthday: rest.birthday || null,
        age: rest.age ? Number(rest.age) : null,
        height: rest.height ? Number(rest.height) : null,
        weight: rest.weight ? Number(rest.weight) : null,
        hairColor: rest.hairColor || null,
        hairStyle: rest.hairStyle || null,
        eyeColor: rest.eyeColor || null,
        hairColorHex: rest.hairColorHex || null,
        eyeColorHex: rest.eyeColorHex || null,
        personality: rest.personality || null,
        features: rest.features || null,
        region: rest.region || null,
        affiliation: rest.affiliation || null,
        foreshadowing: rest.foreshadowing || null,
        death: rest.death || null,
        notes: rest.notes || null,
        aliases: rest.aliases || null,
        imageUrl: rest.imageUrl || null,
      },
    });

    return NextResponse.json(character, { status: 201 });
  } catch (error) {
    console.error("POST /api/character error:", error);
    return NextResponse.json(
      { error: "캐릭터를 생성할 수 없습니다." },
      { status: 500 }
    );
  }
}
