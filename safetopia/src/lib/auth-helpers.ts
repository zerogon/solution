import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * 앱 셸 공통 가드. 세션 확인 후 `Owner` 행을 읽어 돌려준다 — 화면마다 이름·쉬는 요일이 필요하다.
 * 행이 없으면(비밀번호를 아직 설정하지 않은 DB) 로그인 화면으로 보낸다.
 */
export async function requireOwner() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const owner = await prisma.owner.findUnique({
    where: { id: "owner" },
    select: { name: true, closedWeekdays: true },
  });
  if (!owner) redirect("/login");
  return owner;
}

/** 서버 액션용 — 리다이렉트 대신 결과값으로 거부한다. */
export async function isSignedIn(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}
