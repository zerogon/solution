import { LeaveType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";

export interface DayLeaveItem {
  id: string;
  name: string;
  /** 툴팁에만 쓴다 — 칸이 좁아 본문에 지점명을 넣으면 이름이 잘린다. */
  branchName: string | null;
  type: LeaveType;
}

/**
 * 캘린더 한 칸의 휴가자 명단. 넘치는 인원은 "+N"으로 접는다.
 * 관리자 전체 캘린더와 관리자 대시보드 모바일이 공유한다.
 */
export function DayLeaveList({ items, max = 4 }: { items: DayLeaveItem[]; max?: number }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-0.5 space-y-0.5">
      {items.slice(0, max).map((it) => (
        <li
          key={it.id}
          className={cn(
            "truncate rounded bg-primary/15 px-0.5 text-[10px] leading-4 text-primary sm:px-1 sm:text-[11px]",
            // 좁은 화면에선 "·오전"이 통째로 잘려 사라지므로 테두리로 반차를 표시한다.
            it.type !== LeaveType.FULL_DAY && "ring-1 ring-inset ring-primary/40",
          )}
          title={[it.name, it.branchName, LEAVE_TYPE_LABEL[it.type]].filter(Boolean).join(" · ")}
        >
          {it.name}
          {/* 360px에선 칩 안쪽이 33px뿐이라 접미사까지 넣으면 세 글자 이름이 잘린다. 이름이 우선. */}
          {it.type !== LeaveType.FULL_DAY && (
            <span className="hidden opacity-70 sm:inline">{it.type === LeaveType.AM_HALF ? "·오전" : "·오후"}</span>
          )}
        </li>
      ))}
      {items.length > max && <li className="text-[10px] text-muted-foreground">+{items.length - max}</li>}
    </ul>
  );
}
