import { AlertTriangle } from "lucide-react";

import { requireOwner } from "@/lib/auth-helpers";
import { getYearSummaries } from "@/lib/queries";
import { getHolidayOracle } from "@/lib/holidays-server";
import { WEEKDAY_LABEL } from "@/lib/labels";
import { todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveEntryForm, type EntryFormInitial } from "@/components/leave/LeaveEntryForm";

/** 추가·수정 화면 공용 본문. 수정이면 그 기록의 일수를 해당 해 잔여에 되돌려 넣고 보여 준다. */
export async function EntryFormPage({ initial, year }: { initial?: EntryFormInitial; year: number }) {
  const owner = await requireOwner();
  const today = todayKstIso();
  const [summaries, { payload }] = await Promise.all([getYearSummaries(year), getHolidayOracle()]);

  const remainingByYear: Record<number, number> = {};
  for (const s of summaries) remainingByYear[s.year] = s.summary.remaining;
  if (initial) {
    const y = Number(initial.startIso.slice(0, 4));
    remainingByYear[y] = (remainingByYear[y] ?? 0) + initial.days;
  }
  // 올해 기록이면 오늘, 다른 해(대개 엑셀에서 옮기는 지난 해)면 그 해 1월 1일에서 시작한다.
  const defaultDate = year === Number(today.slice(0, 4)) ? today : `${year}-01-01`;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title={initial ? "기록 고치기" : "연차 기록"}
        description={
          owner.closedWeekdays.length > 0
            ? `쉬는 요일(${owner.closedWeekdays.map((d) => WEEKDAY_LABEL[d]).join("·")})과 공휴일은 차감에서 빠집니다.`
            : "공휴일은 차감에서 빠집니다."
        }
      />
      {!payload && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>공휴일 정보를 불러오지 못했습니다</AlertTitle>
          <AlertDescription>일수를 자동으로 셀 수 없습니다. 일수를 직접 입력하거나 잠시 후 새로고침해주세요.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-5">
          <LeaveEntryForm
            closedWeekdays={owner.closedWeekdays}
            holidays={{ covered: payload?.covered ?? [], years: payload?.years ?? {} }}
            remainingByYear={remainingByYear}
            defaultDate={defaultDate}
            initial={initial}
          />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        공휴일 정보가 없는 오래된 기간이거나 회사 사정으로 일수가 다르면 &lsquo;일수 직접 입력&rsquo;으로 엑셀에 적어 둔 일수를 그대로 넣으세요.
      </p>
    </div>
  );
}
