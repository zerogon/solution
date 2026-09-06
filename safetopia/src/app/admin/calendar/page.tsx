import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { DayLeaveList } from "@/components/leave/DayLeaveList";

export const dynamic = "force-dynamic";

type SP = { m?: string; branch?: string };

/**
 * 전체 연차 캘린더(Phase 2). `LeaveRequestDay`(확정 건만 존재)를 지점으로 거른다.
 * 취소는 자식 행이 없으므로 여기 나오지 않는다 — 그건 `/admin/leaves` 목록의 몫.
 */
export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(sp.m, today);
  const { first, last } = monthBounds(ym);
  const branch = sp.branch || "";

  const [rows, branches, { oracle }] = await Promise.all([
    prisma.leaveRequestDay.findMany({
      where: {
        date: { gte: parseDate(first), lte: parseDate(last) },
        user: branch ? { branchId: branch } : undefined,
      },
      include: {
        user: { select: { name: true, branch: { select: { name: true } } } },
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
  const [y, mo] = ym.split("-").map(Number);

  const href = (over: Partial<{ m: string; branch: string }>) => {
    const q = new URLSearchParams();
    const v = { m: ym, branch, ...over };
    if (v.m !== today.slice(0, 7)) q.set("m", v.m);
    if (v.branch) q.set("branch", v.branch);
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
        description="지점별로 누가 언제 쉬는지 한눈에 봅니다."
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
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4">
          <MonthGrid
            ym={ym}
            today={today}
            oracle={oracle}
            renderBadge={(iso) => {
              const n = byDate.get(iso)?.length ?? 0;
              return n > 0 ? <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{n}</span> : null;
            }}
            renderDay={(iso) => (
              <DayLeaveList
                items={(byDate.get(iso) ?? []).map((r) => ({
                  id: r.id,
                  name: r.user.name,
                  branchName: r.user.branch?.name ?? null,
                  type: r.type,
                }))}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
