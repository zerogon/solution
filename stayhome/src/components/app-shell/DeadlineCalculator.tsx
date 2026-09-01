"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";

import { todayKstIso } from "@/lib/utils";
import { subtractBusinessDaysIso } from "@/lib/business-days";
import { holidayOracle, type HolidayMap } from "@/lib/holidays-kr";
import { Button } from "@/components/ui/button";
import { LEAD_BUSINESS_DAYS } from "./deadline-shared";

/**
 * 달력 본문만 지연 로드한다 — `react-day-picker` + `ko` 로케일(~90KB)이 셸 청크로
 * 들어가면 `/admin/*` 세 화면까지 그걸 **초기 페이로드로** 받는다.
 *
 * ⚠️ 인라인 전환(달력이 상시 노출)으로 이 장치의 값이 줄었다는 것은 알고 있다 —
 * 이제 데스크톱의 모든 인증 페이지가 이 청크를 실제로 **받는다**(예전엔 팝업을 연
 * 사람만 받았다). 그래도 유지하는 이유는 둘이다: 청크가 셸의 정적 청크에 박히지 않고
 * 하이드레이션 **뒤에** 오며, 사이드바를 접어 둔 세션에서는 아예 렌더되지 않아
 * 여전히 받지 않는다. `ssr: false`가 무해한 이유는 바뀌었다 — 포털 안이라서가 아니라
 * 서버 HTML이 이 자리를 비워 두는 것이 아래 `mounted` 게이트와 같은 뜻이라서다.
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
 * `AppShell`의 `<aside>`가 `hidden … md:flex`로 쓰는 것과 **같은 경계**다.
 * 어긋나면 증상이 조용하다 — 보이지도 않는 위젯이 공휴일을 받아오고 달력 청크를 내려받는다.
 */
const DESKTOP_MQ = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_MQ);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * 사이드바 마감일 계산기 — 기준일에서 **영업일 기준 10일 전**.
 *
 * ## 왜 셸에 있나
 * 사이드바는 **상시 표시판**이다. 예전엔 그 표시판이 요약 한 줄이고 달력은 팝업이었는데,
 * 이제 달력과 답이 통째로 사이드바 안에 산다 — 조회 화면을 떠나지 않고 곁눈질하려고
 * 만든 도구라, 누르지 않아도 보이는 것이 이 위젯의 목적 전부다.
 *
 * ## 데스크톱 전용이 더 이상 공짜가 아니다
 * `AppShell`의 `<aside>`가 `hidden … md:flex`라 md 미만에서는 **보이지 않는다.** 팝업이던
 * 시절엔 그것으로 충분했다 — 안 보이면 누를 수도 없으니 아무 일도 일어나지 않았다.
 * 상시 렌더가 되면서 그 전제가 깨졌다: 실측으로 390px 뷰포트에서도 컴포넌트가 마운트돼
 * `/api/holidays`를 부르고 달력 청크(~90KB)를 내려받았다. **아무도 볼 수 없는 위젯 때문에.**
 * 그래서 `DESKTOP_MQ`가 생겼다. 이 상수는 `<aside>`의 `md:` 분기와 한 쌍이다.
 *
 * ## 하이드레이션 + 페치 게이트가 같은 한 줄에 걸려 있다
 * `<aside>`는 서버 HTML에 **들어간다.** 그런데 달력이 상시 노출이므로 기준일을 클릭
 * 이전에 정해야 하고, `todayKstIso()`를 렌더에서 그냥 부르면 KST↔UTC 15:00 경계에서
 * 서버/클라 값이 갈린다. `useSyncExternalStore`의 **서버 스냅샷이 false**라 그 문제가
 * 미디어쿼리 구독과 같은 자리에서 해결된다 — `AppShell`이 사이드바 접힘에 쓰는 것과 같은
 * 관용구다. `useEffect` + `setState`를 쓰지 않는 이유는 그 lint 오류를 하나 더 늘리지
 * 않기 위해서다.
 *
 * 결과적으로 `picked !== null` 한 줄이 넷을 동시에 뜻한다 —
 * **마운트됐고 · 데스크톱이고 · 사이드바가 펼쳐져 있고 · 서버 렌더가 아니다.**
 * 그래서 `useQuery`의 `enabled` 게이트가 그대로 살아 있고, `{picked && <Body/>}`가
 * 그 셋 중 하나라도 아니면 달력 청크를 **아예 요청하지 않는다.**
 * 덤으로 `todayKstIso()`가 렌더마다 재평가되므로 자정을 넘겨 켜둔 PWA에서도 "오늘"이
 * 밀리지 않는다(`SearchView`는 마운트 시 한 번 메모하는데, 세션 내내 사는 셸에서는 그게 틀린다).
 */
export function DeadlineCalculator({
  collapsed,
  onExpand,
}: {
  collapsed: boolean;
  /** 레일에서 아이콘을 눌렀을 때 사이드바를 펼친다. `collapsed`일 때만 쓰인다. */
  onExpand: () => void;
}) {
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_MQ).matches,
    () => false,
  );
  /** 사용자가 고른 날. null이면 "오늘"이다 — 오늘은 상태가 아니라 렌더 시점의 사실이다. */
  const [override, setOverride] = useState<string | null>(null);
  const active = isDesktop && !collapsed;
  const picked = active ? (override ?? todayKstIso()) : null;

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["holidays"],
    queryFn: fetchHolidays,
    // ⚠️ 이 게이트를 지우면 안 된다. 키가 더 이상 연도를 필요로 하지 않는다고 없애면
    // 인증된 **모든 페이지 로드**에 요청이 하나씩 조용히 붙는다. 지금은 `picked`가
    // 위 헤더의 넷을 한꺼번에 뜻하므로, 모바일과 레일 사용자에겐 요청이 0건이다.
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
  // 점이 없어서 "위젯이 그 날을 모른다"처럼 읽힌다. 답을 설명하는 것은 요약 줄
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

  const pickToday = useCallback(() => setOverride(todayKstIso()), []);

  // 레일 — 표시판이 아니라 **문**이다. 60px에 달력이 들어가지 않으므로 아이콘만 두고
  // 누르면 사이드바를 펼친다. 예전 레일에 있던 실패 점은 여기서 사라졌는데, 접힌
  // 상태에서는 공휴일을 아예 받지 않아(위 `enabled` 게이트) 신고할 실패가 없기 때문이다.
  if (collapsed) {
    return (
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onExpand}
          title="마감일 계산기 · 사이드바 펼치기"
          aria-label="마감일 계산기 · 사이드바 펼치기"
        >
          <CalendarClock className="size-4.5 text-sidebar-foreground/70" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <CalendarClock className="size-4.5 shrink-0 text-sidebar-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          마감일 계산기
        </span>
        <Button variant="ghost" size="xs" onClick={pickToday}>
          오늘
        </Button>
      </div>

      {picked && (
        <DeadlineCalculatorBody
          picked={picked}
          onPick={setOverride}
          answer={answer}
          skipped={result?.ok ? result : null}
          holidayDates={holidayDates}
          coveredRange={coveredRange}
          loading={isPending || isFetching}
          failed={failed}
          onRetry={() => void refetch()}
        />
      )}
    </div>
  );
}
