import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { folderId, characterIds } = body;

    if (!folderId || !Array.isArray(characterIds) || characterIds.length === 0) {
      return NextResponse.json(
        { error: "folderId와 characterIds는 필수입니다." },
        { status: 400 }
      );
    }

    await prisma.folderCharacter.createMany({
      data: characterIds.map((characterId: string) => ({
        folderId,
        characterId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ message: "캐릭터가 폴더에 추가되었습니다." }, { status: 201 });
  } catch (error) {
    console.error("POST /api/folder/add-character error:", error);
    return NextResponse.json(
      { error: "캐릭터를 폴더에 추가할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { folderId, characterId } = body;

    if (!folderId || !characterId) {
      return NextResponse.json(
        { error: "folderId와 characterId는 필수입니다." },
        { status: 400 }
      );
    }

    await prisma.folderCharacter.delete({
      where: {
        folderId_characterId: { folderId, characterId },
      },
    });

    return NextResponse.json({ message: "폴더에서 제거되었습니다." });
  } catch (error) {
    console.error("DELETE /api/folder/add-character error:", error);
    return NextResponse.json(
      { error: "폴더에서 캐릭터를 제거할 수 없습니다." },
      { status: 500 }
    );
  }
}
