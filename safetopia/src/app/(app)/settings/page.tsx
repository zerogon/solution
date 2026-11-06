import Link from "next/link";

import { getOwner, getPeriodSummaries } from "@/lib/queries";
import { formatPeriodLabel } from "@/lib/leave-accrual";
import { formatDays } from "@/lib/labels";
import { todayKstIso, cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OwnerSettingsForm } from "@/components/settings/OwnerSettingsForm";
import { LeavePeriodDialog } from "@/components/settings/LeavePeriodDialog";
import { ResetPeriodButton } from "@/components/settings/ResetPeriodButton";

export const dynamic = "force-dynamic";

function signed(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : "−"}${formatDays(Math.abs(n))}`;
}

export default async function SettingsPage() {
  const today = todayKstIso();
  const owner = await getOwner();
  const summaries = owner.hireIso ? await getPeriodSummaries(owner.hireIso, today) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="설정" />

      <Card id="owner">
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>입사일로 연차 회차와 발생 일수를 계산합니다(근로기준법 60조).</CardDescription>
        </CardHeader>
        <CardContent>
          <OwnerSettingsForm name={owner.name} hireIso={owner.hireIso} todayIso={today} />
        </CardContent>
      </Card>

      <Card id="periods">
        <CardHeader>
          <CardTitle>연차 회차</CardTitle>
          <CardDescription>
            발생은 자동 계산입니다. 회사 사정으로 다른 만큼(이월·보정)만 회차마다 적습니다. 1년 미만은 매달 1일씩, 만 1년부터 15일, 3년차부터 2년마다 하루씩 늘어 최대 25일.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {!owner.hireIso ? (
            <p className="px-6 text-sm text-amber-700">위에서 입사일을 입력하면 회차별 발생·잔여가 여기에 나옵니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">회차</TableHead>
                  <TableHead className="text-right">발생</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">이월</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">보정</TableHead>
                  <TableHead className="text-right">사용</TableHead>
                  <TableHead className="text-right">잔여</TableHead>
                  <TableHead className="hidden lg:table-cell">메모</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s) => {
                  const label = s.period ? formatPeriodLabel(s.period) : "입사 전";
                  return (
                    <TableRow key={s.index}>
                      <TableCell className="pl-4 font-medium">
                        {s.period ? (
                          <Link href={`/calendar?m=${s.period.startIso.slice(0, 7)}`} className="break-keep hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{label}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {s.period ? (
                          <>
                            {s.summary.granted}
                            {s.upcoming && <span className="ml-1 text-xs text-muted-foreground">예정</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{s.summary.carriedOver || "—"}</TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">{signed(s.summary.adjusted)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{s.summary.used}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-semibold tabular-nums",
                          s.period && s.summary.remaining < 0 && "text-destructive",
                          !s.period && "text-muted-foreground",
                        )}
                      >
                        {s.period ? s.summary.remaining : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">{s.memo ?? "—"}</TableCell>
                      <TableCell>
                        {s.period && (
                          <div className="flex items-center justify-end gap-1 pr-2">
                            <LeavePeriodDialog
                              index={s.index}
                              label={label}
                              initial={s.hasRow ? { carriedOverDays: s.summary.carriedOver, adjustedDays: s.summary.adjusted, memo: s.memo } : undefined}
                            />
                            {s.hasRow && <ResetPeriodButton index={s.index} label={label} />}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
