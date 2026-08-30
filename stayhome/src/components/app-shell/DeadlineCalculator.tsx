"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronsUpDown } from "lucide-react";

import { cn, formatKoMd, todayKstIso } from "@/lib/utils";
import { subtractBusinessDaysIso } from "@/lib/business-days";
import { holidayOracle, type HolidayMap } from "@/lib/holidays-kr";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LEAD_BUSINESS_DAYS } from "./deadline-shared";

/**
 * 팝업 본문만 지연 로드한다 — `react-day-picker` + `ko` 로케일(~90KB)이 셸 청크로
 * 들어가면 `/admin/*` 세 화면까지 그걸 받는다. 상세는 `DeadlineCalculatorBody`의 헤더.
 * `ssr: false`가 무해한 이유는 이 컴포넌트가 클릭 뒤에야 생기는 포털 안에서만
 * 렌더되기 때문이다.
 */
const DeadlineCalculatorBody = dynamic(
  () => import("./DeadlineCalculatorBody").then((m) => m.DeadlineCalculatorBody),
  { ssr: false },
);

type HolidayResponse = {
  years: Record<string, HolidayMap>;
  /** 판정 가능한 연도. **커버리지의 진실은 이쪽이지 `years`의 키가 아니다.** */
  covered: number[];
  stale?: boolean;
};

async function fetchHolidays(): Promise<HolidayResponse> {
  // 파라미터가 없다 — 피드 한 문서가 모든 연도를 덮는다. 덕분에 쿼리 키가 상수가 되고
  // 날짜를 오가며 캐시 엔트리가 늘던 일이 사라진다.
  const res = await fetch("/api/holidays");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as HolidayResponse;
}

/**
 * 사이드바 마감일 계산기 — 기준일에서 **영업일 기준 10일 전**.
 *
 * ## 왜 셸에 있나
 * 사이드바 줄은 **상시 표시판**이고 팝업은 입력 장치일 뿐이다. 팝업을 닫아도 답이
 * 화면에 남는 것이 이 계산기를 페이지가 아니라 셸에 둔 이유 전부다 — 조회 화면을
 * 떠나지 않고 곁눈질하려고 만든 도구다.
 *
 * ## 데스크톱 전용은 공짜다
 * `AppShell`의 `<aside>`가 `hidden … md:flex`라 md 미만에서는 보이지 않는다.
 * 미디어쿼리 훅도, 두 벌 마운트도 필요 없다 — `DateRangeField`가 두 갈래를 마운트하는
 * 것은 그쪽이 *뷰포트* 분기를 넘나들기 때문이고, 여기는 그렇지 않다.
 * `collapsed`는 컴포넌트 상태이지 미디어쿼리가 아니다.
 *
 * ## 하이드레이션
 * `<aside>`는 서버 HTML에 **들어간다**. 그래서 `picked`가 `null`로 시작하고 첫 렌더의
 * 문구가 양쪽 다 상수다. `todayKstIso()`는 **이벤트 핸들러 안에서만** 부른다 —
 * 렌더 중에 부르면 KST↔UTC 15:00 경계에서 서버/클라 값이 갈린다. 덤으로, 자정을
 * 넘겨 켜둔 PWA에서도 "오늘"이 밀리지 않는다(`SearchView`는 마운트 시 한 번
 * 메모하는데, 세션 내내 살아 있는 셸에서는 그게 틀린다).
 */
export function DeadlineCalculator({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["holidays"],
    queryFn: fetchHolidays,
    // ⚠️ 이 게이트를 지우면 안 된다. 키가 더 이상 연도를 필요로 하지 않는다고 없애면
    // 인증된 **모든 페이지 로드**에 요청이 하나씩 조용히 붙는다. `picked`는 팝업을
    // 처음 열 때만 세워지므로, 지금은 관리 화면에서 요청이 0건이다.
    enabled: picked !== null,
    // 프로바이더 기본 30초는 이 데이터에 무의미하다 — 공휴일은 하루에 몇 번씩
    // 바뀌지 않고, 서버가 이미 12시간 캐시를 들고 있다.
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    // 기본값 3회 + 지수 백오프는 실패를 **6초 뒤에** 보여준다(실측). 이 위젯의
    // 실패는 대부분 결정적이라(키 미설정 · 세션 만료 · 업스트림 다운) 재시도로
    // 뒤집히지 않고, 그동안 "확인 중"이 답인 것처럼 앉아 있는다. 일시적 네트워크
    // 끊김만 1회로 덮고 나머지는 곧바로 "계산 불가"를 말한 뒤 `다시 시도`를 준다.
    retry: 1,
  });

  const result = useMemo(() => {
    if (!picked || !data) return null;
    return subtractBusinessDaysIso(
      picked,
      LEAD_BUSINESS_DAYS,
      holidayOracle(data.covered, data.years),
    );
  }, [picked, data]);

  const failed = isError || (result != null && !result.ok);
  const answer = result?.ok ? result.iso : null;

  // 달력에 점을 찍을 공휴일 — **건너뛴 것만이 아니라 받아온 전부**다.
  // 건너뛴 것만 찍으면 화면에 보이는 다른 공휴일(예: 주말과 겹쳐 주말로 센 광복절)에
  // 점이 없어서 "위젯이 그 날을 모른다"처럼 읽힌다. 답을 설명하는 것은 아래 요약 줄
  // ("주말 4일 · 공휴일 1일")이고, 점은 달력의 사실을 그리는 것이라 역할이 다르다.
  const holidayDates = useMemo(
    () => (data ? Object.values(data.years).flatMap((m) => Object.keys(m)) : []),
    [data],
  );

  /** 달력이 이동할 수 있는 범위. 서버가 신고한 커버리지가 단일 출처다. */
  const coveredRange = useMemo<[number, number] | null>(
    () =>
      data && data.covered.length > 0
        ? [data.covered[0], data.covered[data.covered.length - 1]]
        : null,
    [data],
  );

  const summary = !picked
    ? "날짜를 선택하세요"
    : failed
      ? "계산 불가 · 공휴일 정보 없음"
      : answer
        ? `${formatKoMd(picked)} → ${formatKoMd(answer)}`
        : "공휴일 정보 확인 중…";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // 열 때 오늘을 읽는다. 렌더가 아니라 여기여야 하는 이유는 위 헤더 참조.
        if (next && picked === null) setPicked(todayKstIso());
        setOpen(next);
      }}
    >
      {/* 트리거 엘리먼트는 접힘/펼침에서 **같은 노드**여야 한다. 삼항으로 서로 다른
          엘리먼트를 갈아끼우면 열려 있는 동안 접었을 때 앵커가 언마운트된다.
          바뀌는 것은 내용뿐이다. */}
      <PopoverTrigger
        className={cn(
          "relative flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none data-popup-open:bg-sidebar-accent",
          collapsed && "justify-center",
        )}
        title={collapsed ? `마감일 계산기 · ${summary}` : undefined}
      >
        <CalendarClock className="size-4.5 shrink-0 text-sidebar-foreground/70" />
        {/* 접힘 상태에서 `hidden`이 아니라 `sr-only`인 것은 `AppSidebar`와 같다 —
            보이지 않을 뿐 접근성 트리에는 남아야 한다. */}
        <span className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
          <span className="block truncate font-medium">마감일 계산기</span>
          <span
            className={cn(
              "block truncate font-mono text-xs tabular-nums",
              failed ? "text-destructive/80" : "text-muted-foreground",
            )}
          >
            {summary}
          </span>
        </span>
        {!collapsed && (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {/* 접힌 레일에서는 요약 줄이 안 보이므로, 실패를 아이콘 위에 점으로 남긴다.
            안 그러면 접은 사용자에게는 위젯이 조용히 무의미해진다. */}
        {collapsed && failed && (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />
        )}
      </PopoverTrigger>

      {/* side/align은 `collapsed`로 분기하지 않는다 — 256px에서도 60px에서도 옳고,
          align="end"라 하단에 붙은 트리거에서 위로 자란다. */}
      <PopoverContent side="right" align="end" sideOffset={8} className="w-72">
        {picked && (
          <DeadlineCalculatorBody
            picked={picked}
            onPick={setPicked}
            answer={answer}
            skipped={result?.ok ? result : null}
            holidayDates={holidayDates}
            coveredRange={coveredRange}
            loading={isPending || isFetching}
            failed={failed}
            onRetry={() => void refetch()}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
