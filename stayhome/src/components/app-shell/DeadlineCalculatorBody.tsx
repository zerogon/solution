"use client";

import { useMemo, useState } from "react";
import { ArrowDown, Copy } from "lucide-react";
import { toast } from "sonner";

import {
  addMonthsIso,
  formatKoMd,
  parseDate,
  startOfMonthIso,
  todayKstIso,
} from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { DeadlineTrace, Skip } from "@/lib/business-days";
import { LEAD_DAYS } from "./deadline-shared";

/** "YYYY-MM-DD"는 사전순이 곧 시간순이라 문자열 비교로 충분하다. */
const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);

/** 캘린더 이동 범위(오늘 기준). 계산기라 과거로도 열어 둔다. */
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 24;

/**
 * 달력 + 결과 — **별도 모듈인 것이 요점이다.**
 *
 * `Calendar`는 `react-day-picker`와 `ko` 로케일을 자기가 속한 청크로 끌고 온다.
 * 이걸 `DeadlineCalculator`에 인라인하면 그 청크가 **인증된 모든 라우트**의 셸
 * 정적 청크에 들어간다 — 실측으로 `/admin/*` 세 화면이 ~90KB짜리 청크를 새로 받게 됐다.
 * 그래서 `next/dynamic`으로 여기만 지연 로드한다. 이 저장소에서 `next/dynamic`을
 * 쓰는 첫 자리이고, 새 패턴을 들인 근거가 그 실측이다. 인라인 전환 뒤의 손익은
 * `DeadlineCalculator`의 dynamic 주석에 적혀 있다.
 *
 * ## `month`는 이제 언마운트로 초기화되지 않는다
 * 팝업이던 시절엔 닫힐 때 언마운트돼 `month`가 다시 계산됐다. 사이드바에 상시
 * 렌더되는 지금은 세션 내내 살아 있으므로, `picked`가 **밖에서** 바뀌면(부모의 "오늘"
 * 버튼) 달력이 그 달로 따라가야 한다. 아래에서 렌더 중 상태 조정으로 처리한다 —
 * `useEffect`가 아니다. 달력 안의 클릭은 `showOutsideDays={false}` 덕분에 언제나
 * 보이는 달의 날짜라 이 조정이 무동작이고, 따라서 화면이 튀지 않는다.
 */
export function DeadlineCalculatorBody({
  picked,
  onPick,
  answer,
  trace,
  holidayDates,
  coveredRange,
  loading,
  failed,
  onRetry,
}: {
  picked: string;
  onPick: (iso: string) => void;
  answer: string | null;
  /** 성공한 계산의 전체 경로. 아래 요약 줄이 이걸로 자기 답을 설명한다. */
  trace: DeadlineTrace | null;
  /** 점을 찍을 공휴일 전체(받아온 연도 범위). 건너뛴 것만이 아니다 — 부모 주석 참조. */
  holidayDates: string[];
  /** 서버가 신고한 판정 가능 연도 [from, to]. 로딩·실패 중에는 null. */
  coveredRange: [number, number] | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const [month, setMonth] = useState(() => parseDate(startOfMonthIso(picked)));
  // 부모가 `picked`를 옮기면(= "오늘" 버튼) 달력도 그 달로 간다. 위 헤더 참조.
  const [lastPicked, setLastPicked] = useState(picked);
  if (picked !== lastPicked) {
    setLastPicked(picked);
    setMonth(parseDate(startOfMonthIso(picked)));
  }
  const today = todayKstIso();

  // 달력이 갈 수 있는 범위. 커버리지 밖으로 넘어가면 모든 날짜가 "계산 불가"라
  // 넘길 이유가 없다. `coveredRange`가 null(로딩·실패)이면 종전 ±12/24로 폴백해
  // 데이터 전후로 팝업이 같은 모양으로 그려지게 한다.
  //
  // ⚠️ 미래 쪽만 좁히는 것이 의도다. 과거는 확정된 사실이라 구멍이 없고, 문제는
  // 아직 공표되지 않은 대체공휴일이라 오직 미래 쪽에만 있다(라우트의 지평선 주석).
  const backLimit = addMonthsIso(startOfMonthIso(today), -MONTHS_BACK);
  const aheadLimit = addMonthsIso(startOfMonthIso(today), MONTHS_AHEAD);
  const startIso = coveredRange
    ? maxIso(backLimit, `${coveredRange[0]}-01-01`)
    : backLimit;
  const endIso = coveredRange
    ? minIso(aheadLimit, `${coveredRange[1]}-12-01`)
    : aheadLimit;

  // `coveredRange[0]` 1월 초 날짜는 이전 해로 걸어가 정당하게 "계산 불가"가 된다.
  // 그걸 숨기려 startMonth를 2월로 미는 것은 과한 잔꾀이고, 위젯의 실제 경계를
  // 안 보이게 만든다. 에러 상태가 자기 일을 하게 둔다.

  async function copy() {
    if (!answer) return;
    try {
      // 붙여넣는 곳이 스프레드시트나 메신저다 — "8.14(금)"이 아니라 ISO를 준다.
      await navigator.clipboard.writeText(answer);
      toast.success("복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  }

  // 커버리지 전체의 공휴일이라 ~205개다(연도 2개 시절엔 ~40개였다). 매 렌더 돌 이유가 없다.
  const holidayModifier = useMemo(() => holidayDates.map(parseDate), [holidayDates]);

  // ⚠️ 예전에는 여기서 `getUTCDay()`로 주말만 로컬 판정해 "기준일이 휴일입니다"를
  // 그렸다. 그건 공휴일 기준일에 뜨지 않았고, 무엇보다 **아무 결과도 설명하지 못했다.**
  // 이제 정확한 조건은 `trace.startIso !== picked`이고, 그 판정은 오라클을 거쳐서 온다.
  const holidayNames = (s: Skip) =>
    s.holidays.length > 0 ? ` (${s.holidays.map((h) => h.name).join(", ")})` : "";

  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        selected={parseDate(picked)}
        month={month}
        onMonthChange={setMonth}
        startMonth={parseDate(startIso)}
        endMonth={parseDate(endIso)}
        // `disabled` 없음 — 의도적으로 `StayRangeCalendar`와 다르다. 저쪽은 예약
        // 흐름이라 과거를 막지만 여기는 계산기다. 이미 지난 마감일을 되짚는 것도
        // 정상 사용이므로 예약 흐름의 제약을 복사해 오지 말 것.
        numberOfMonths={1}
        onSelect={(_day, triggerDate) => {
          // **2번째 인자를 읽는다.** mode="single"에서 이미 선택된 날을 다시 누르면
          // 1번째 인자가 undefined(선택 해제)로 와서 계산이 통째로 날아간다.
          // `triggerDate`는 언제나 누른 날이라 재클릭이 멱등해진다.
          // timeZone="utc"라 이 Date는 UTC 자정이고 그대로 ISO 날짜가 된다.
          onPick(triggerDate.toISOString().slice(0, 10));
        }}
        classNames={{
          // 프리미티브의 `selected`는 일부러 비어 있다(유일한 기존 호출자가
          // range_*로 그린다). single 모드 호출자는 반드시 직접 채워야 한다.
          // RDP가 twMerge 없이 join하므로 <td>가 아니라 [&>button]을 겨냥한다.
          selected:
            "[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        }}
        modifiers={{
          ...(answer ? { lead: parseDate(answer) } : {}),
          ...(holidayModifier.length > 0 ? { holiday: holidayModifier } : {}),
        }}
        modifiersClassNames={{
          // ring이 아니라 outline: `today`가 이미 [&>button]:ring-1을 쓰고 있어
          // 같은 속성을 겹치면 RDP의 join(" ") 때문에 승자가 스타일시트 순서로 정해진다.
          lead: "[&>button]:outline [&>button]:outline-2 [&>button]:-outline-offset-2 [&>button]:outline-primary/45",
          // 공휴일은 글자색이 아니라 점이다 — `selected`가 이미 color를 쓰고 있어
          // 둘 다 걸리는 날에서 깜빡인다. `day`가 이미 relative라 after:가 그대로 먹는다.
          holiday:
            "after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-destructive",
        }}
      />

      <div className="rounded-lg border p-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">기준일</span>
          <span className="font-mono text-sm tabular-nums">{formatKoMd(picked)}</span>
        </div>
        <div className="flex items-center gap-1 py-1 text-xs text-muted-foreground">
          <ArrowDown className="size-3" />
          {LEAD_DAYS}일 전 · 휴일이면 앞당김
        </div>

        {/* 라이브 리전은 팝업이 열리는 순간부터 **같은 노드**로 존재해야 한다.
            성공/실패를 형제 노드로 두면 상태 전환이 스크린리더에 안 읽힌다. */}
        <div aria-live="polite" aria-atomic="true">
          {failed ? (
            <Alert variant="destructive">
              <AlertTitle>계산할 수 없습니다</AlertTitle>
              <AlertDescription>
                공휴일 정보를 불러오지 못했습니다.
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-1 align-baseline"
                  onClick={onRetry}
                >
                  다시 시도
                </Button>
              </AlertDescription>
            </Alert>
          ) : answer ? (
            <div className="flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-accent-foreground">
              <Badge variant="secondary" className="shrink-0">
                D-{LEAD_DAYS}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-base font-semibold tabular-nums">
                  {formatKoMd(answer)}
                </div>
                {/* formatKoMd에는 연도가 없다. 1월 초 기준일은 결과가 전년이 되므로
                    raw ISO를 같이 깐다 — 연도가 드러나고, 복사 버튼의 출처가 명확해지고,
                    스크린리더가 읽을 파싱 가능한 문자열이 생긴다. */}
                <div className="font-mono text-[11px] tabular-nums opacity-70">
                  {answer}
                </div>
              </div>
              <span className="sr-only">
                마감일은 {answer.slice(0, 4)}년 {Number(answer.slice(5, 7))}월{" "}
                {Number(answer.slice(8, 10))}일입니다
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={copy}
                aria-label="날짜 복사"
              >
                <Copy />
              </Button>
            </div>
          ) : (
            <div className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              {loading ? "공휴일 정보 확인 중…" : "계산 중…"}
            </div>
          )}
        </div>

        {/* 이 줄들이 기능의 작업 증명이다 — 없으면 "광복절을 건너뛴 것"과 "고장난 것"을
            사용자가 구별할 수 없다. 규칙이 3단계이므로 보정이 일어난 단계만 말한다:
            둘 다 없으면 "그대로", 하나만 있으면 그 하나만. */}
        {trace && (
          <div className="space-y-0.5 pt-1.5 text-[11px] text-muted-foreground">
            {trace.startIso !== picked && (
              // 한 문장을 JSX 텍스트 노드로 쪼개면 줄바꿈이 공백으로 들어가 이름 괄호
              // 앞이 두 칸이 된다. 문장 하나는 표현식 하나로 만든다.
              <p>
                {`기준일 ${formatKoMd(picked)} 휴일${holidayNames(trace.baseSkipped)}` +
                  ` → ${formatKoMd(trace.startIso)}부터`}
              </p>
            )}
            {trace.rawIso !== trace.iso ? (
              <p>
                {`${LEAD_DAYS}일째 ${formatKoMd(trace.rawIso)} 휴일${holidayNames(trace.resultSkipped)}` +
                  ` → ${formatKoMd(trace.iso)}`}
              </p>
            ) : (
              <p>{LEAD_DAYS}일째가 그대로 영업일입니다</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
