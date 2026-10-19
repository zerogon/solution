import Link from "next/link";

import { getOwner, getYearSummaries } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { todayKstIso, cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OwnerSettingsForm } from "@/components/settings/OwnerSettingsForm";
import { LeaveYearDialog } from "@/components/settings/LeaveYearDialog";
import { DeleteYearButton } from "@/components/settings/DeleteYearButton";
import { PasswordForm } from "@/components/settings/PasswordForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const year = Number(todayKstIso().slice(0, 4));
  const [owner, summaries, rows] = await Promise.all([getOwner(), getYearSummaries(year), prisma.leaveYear.findMany()]);
  const rowByYear = new Map(rows.map((r) => [r.year, r]));
  // 다음에 추가할 법한 해: 아직 부여가 없는 가장 최근 해, 없으면 가장 이른 해의 전년.
  const suggestYear = summaries.find((s) => s.missing)?.year ?? Math.min(...summaries.map((s) => s.year)) - 1;

  return (
    <div className="space-y-6">
      <PageHeader title="설정" />

      <Card id="years">
        <CardHeader>
          <CardTitle>연도별 부여</CardTitle>
          <CardDescription>해마다 받은 연차 일수와 전년도에서 넘어온 이월 일수를 적습니다.</CardDescription>
          <CardAction>
            <LeaveYearDialog suggestYear={suggestYear} />
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">연도</TableHead>
                <TableHead className="text-right">부여</TableHead>
                <TableHead className="text-right">이월</TableHead>
                <TableHead className="text-right">사용</TableHead>
                <TableHead className="text-right">잔여</TableHead>
                <TableHead className="hidden sm:table-cell">메모</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s) => {
                const row = rowByYear.get(s.year);
                return (
                  <TableRow key={s.year}>
                    <TableCell className="pl-4 font-mono font-medium tabular-nums">
                      <Link href={`/leaves?year=${s.year}`} className="hover:underline">
                        {s.year}
                      </Link>
                    </TableCell>
                    {s.missing ? (
                      <TableCell colSpan={2} className="text-right text-xs text-amber-700">
                        미입력
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="text-right font-mono tabular-nums">{s.summary.granted}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{s.summary.carriedOver}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-mono tabular-nums">{s.summary.used}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold tabular-nums",
                        s.summary.remaining < 0 && "text-destructive",
                      )}
                    >
                      {s.summary.remaining}
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground sm:table-cell">
                      {s.memo ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 pr-2">
                        {row ? (
                          <>
                            <LeaveYearDialog
                              initial={{
                                year: row.year,
                                grantedDays: row.grantedDays,
                                carriedOverDays: row.carriedOverDays,
                                memo: row.memo,
                              }}
                            />
                            <DeleteYearButton year={row.year} />
                          </>
                        ) : (
                          <LeaveYearDialog suggestYear={s.year} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <OwnerSettingsForm name={owner.name} closedWeekdays={owner.closedWeekdays} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>비밀번호</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
