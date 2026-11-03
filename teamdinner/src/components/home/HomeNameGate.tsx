"use client";

import { NameGate } from "@/components/NameGate";
import { setMemberNameAndNotify } from "@/lib/member";
import { useMemberName } from "@/lib/use-member";

/** 첫 화면에서 이름이 없으면 바로 묻는다. 한 번 저장되면 회식 화면에서도 다시 묻지 않는다. */
export function HomeNameGate() {
  const stored = useMemberName();
  const open = stored === null; // undefined(hydration 전)에는 열지 않는다
  return (
    <NameGate
      open={open}
      current={null}
      description="회식 메뉴를 담을 때 이 이름으로 표시됩니다. 로그인은 없습니다."
      onSubmit={(name) => setMemberNameAndNotify(name)}
    />
  );
}
