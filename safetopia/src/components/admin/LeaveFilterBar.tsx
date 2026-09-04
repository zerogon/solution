"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { NativeSelect } from "@/components/ui/native-select";
import { LEAVE_STATUS_LABEL } from "@/lib/labels";
import { LeaveStatus } from "@/generated/prisma/enums";

/** 지점·상태·연도 필터. 바꾸면 URL만 갱신하고 서버 컴포넌트가 다시 읽는다. */
export function LeaveFilterBar({
  branches,
  years,
  current,
}: {
  branches: { id: string; name: string }[];
  years: number[];
  current: { branch: string; status: string; year: number };
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/admin/leaves?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
      <NativeSelect aria-label="연도" value={String(current.year)} onChange={(e) => update("year", e.target.value)} className="sm:w-28">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="지점" value={current.branch} onChange={(e) => update("branch", e.target.value)} className="sm:w-36">
        <option value="">전체 지점</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="상태" value={current.status} onChange={(e) => update("status", e.target.value)} className="sm:w-32">
        <option value="">전체 상태</option>
        {Object.values(LeaveStatus).map((s) => (
          <option key={s} value={s}>
            {LEAVE_STATUS_LABEL[s]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
