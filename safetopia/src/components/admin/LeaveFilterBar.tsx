"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { NativeSelect } from "@/components/ui/native-select";
import { LEAVE_STATUS_LABEL } from "@/lib/labels";
import { LeaveStatus } from "@/generated/prisma/enums";

/**
 * 지점·상태·연도 필터. 바꾸면 URL만 갱신하고 서버 컴포넌트가 다시 읽는다.
 *
 * 연도·상태는 "신청 목록" 탭에서만 뜬다 — 직원별 현황은 각자의 현재 **회차**를 보여 주므로
 * 캘린더 연도를 고를 자리가 없다.
 */
export function LeaveFilterBar({
  branches,
  years,
  current,
  showYear = true,
  showStatus = true,
}: {
  branches: { id: string; name: string }[];
  years: number[];
  current: { branch: string; status: string; year: number };
  showYear?: boolean;
  showStatus?: boolean;
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
    <div className="flex flex-wrap gap-2">
      {showYear && (
        <NativeSelect aria-label="연도" value={String(current.year)} onChange={(e) => update("year", e.target.value)} className="sm:w-28">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </NativeSelect>
      )}
      <NativeSelect aria-label="지점" value={current.branch} onChange={(e) => update("branch", e.target.value)} className="sm:w-36">
        <option value="">전체 지점</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </NativeSelect>
      {showStatus && (
        <NativeSelect aria-label="상태" value={current.status} onChange={(e) => update("status", e.target.value)} className="sm:w-32">
          <option value="">전체 상태</option>
          {Object.values(LeaveStatus).map((s) => (
            <option key={s} value={s}>
              {LEAVE_STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  );
}
