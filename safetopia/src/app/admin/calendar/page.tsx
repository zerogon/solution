import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { monthBounds, monthGrid, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveStatus, LeaveType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type SP = { m?: string; branch?: string; status?: string };

/**
 * 전체 연차 캘린더(Phase 2). `LeaveRequestDay`(PENDING/APPROVED)를 지점·상태로 거른다.
 * 반려/취소는 자식 행이 없으므로 여기 나오지 않는다 — 그건 `/admin/leaves` 목록의 몫.
 */
export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(sp.m, today);
  const { first, last } = monthBounds(ym);
  const branch = sp.branch || "";
  const status = sp.status === "APPROVED" || sp.status === "PENDING" ? sp.status : "";

  const [rows, branches, { oracle }] = await Promise.all([
    prisma.leaveRequestDay.findMany({
      where: {
        date: { gte: parseDate(first), lte: parseDate(last) },
        user: branch ? { branchId: branch } : undefined,
        leaveRequest: status ? { status: status as LeaveStatus } : undefined,
      },
      include: {
        user: { select: { name: true, branch: { select: { name: true } } } },
        leaveRequest: { select: { status: true } },
      },
      orderBy: [{ user: { branch: { name: "asc" } } }, { user: { name: "asc" } }],
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getHolidayOracle(),
  ]);

  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = toIsoDate(r.date);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(r);
  }
  const grid = monthGrid(ym);
  const [y, mo] = ym.split("-").map(Number);

  const href = (over: Partial<{ m: string; branch: string; status: string }>) => {
    const q = new URLSearchParams();
    const v = { m: ym, branch, status, ...over };
    if (v.m !== today.slice(0, 7)) q.set("m", v.m);
    if (v.branch) q.set("branch", v.branch);
    if (v.status) q.set("status", v.status);
    const s = q.toString();
    return `/admin/calendar${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="전체 캘린더"
        description="지점·상태로 걸러 누가 언제 쉬는지 한눈에 봅니다."
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" render={<Link href={href({ m: shiftMonth(ym, -1) })} />} nativeButton={false} aria-label="이전 달">
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center font-mono text-sm font-semibold tabular-nums">
              {y}.{String(mo).padStart(2, "0")}
            </span>
            <Button variant="outline" size="icon-sm" render={<Link href={href({ m: shiftMonth(ym, 1) })} />} nativeButton={false} aria-label="다음 달">
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ branch: "" })} className={chip(!branch)}>전체 지점</Link>
          {branches.map((b) => (
            <Link key={b.id} href={href({ branch: b.id })} className={chip(branch === b.id)}>
              {b.name}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Link href={href({ status: "" })} className={chip(!status)}>전체</Link>
          <Link href={href({ status: "APPROVED" })} className={chip(status === "APPROVED")}>승인</Link>
          <Link href={href({ status: "PENDING" })} className={chip(status === "PENDING")}>대기</Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAY_LABEL.map((w, i) => (
              <div key={w} className={cn("py-1", i === 0 && "text-destructive/70")}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
            {grid.map(({ iso, inMonth }) => {
              const d = parseDate(iso);
              const holiday = oracle.covers(iso) && oracle.isHoliday(iso) ? oracle.nameOf(iso) : null;
              const items = byDate.get(iso) ?? [];
              return (
                <div key={iso} className={cn("min-h-20 bg-background p-1 sm:min-h-28 sm:p-1.5", !inMonth && "bg-muted/40 text-muted-foreground/50")}>
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full font-mono text-xs tabular-nums",
                        iso === today && "bg-foreground text-background font-semibold",
                        iso !== today && (d.getUTCDay() === 0 || holiday) && inMonth && "text-destructive",
                      )}
                    >
                      {d.getUTCDate()}
                    </span>
                    {items.length > 0 && inMonth && (
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
                    )}
                  </div>
                  {holiday && inMonth && <div className="truncate text-[10px] text-destructive/80">{holiday}</div>}
                  {inMonth && (
                    <ul className="mt-0.5 space-y-0.5">
                      {items.slice(0, 4).map((r) => (
                        <li
                          key={r.id}
                          className={cn(
                            "truncate rounded px-1 text-[10px] leading-4 sm:text-[11px]",
                            r.leaveRequest.status === LeaveStatus.APPROVED ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-800",
                          )}
                          title={`${r.user.name} · ${r.user.branch?.name ?? ""} · ${LEAVE_TYPE_LABEL[r.type]}`}
                        >
                          {r.user.name}
                          {r.type !== LeaveType.FULL_DAY && <span className="opacity-70">{r.type === LeaveType.AM_HALF ? "·오전" : "·오후"}</span>}
                        </li>
                      ))}
                      {items.length > 4 && <li className="text-[10px] text-muted-foreground">+{items.length - 4}</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
