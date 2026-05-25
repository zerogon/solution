import { NextRequest, NextResponse } from "next/server";
import { submitIdea } from "@/db/queries";

export async function POST(request: NextRequest) {
  const { name, content } = await request.json();

  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent || trimmedContent.length > 1000) {
    return NextResponse.json(
      { error: "내용을 입력해주세요 (1000자 이내)" },
      { status: 400 }
    );
  }

  const trimmedName =
    typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null;

  await submitIdea(trimmedName, trimmedContent);
  return NextResponse.json({ ok: true });
}
