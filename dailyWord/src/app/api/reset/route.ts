import { NextRequest, NextResponse } from "next/server";
import { deleteSessionSelection } from "@/db/queries";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400 }
    );
  }

  await deleteSessionSelection(sessionId);
  return NextResponse.json({ ok: true });
}
