"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingHorizon, formatKstDate, parseKstDate } from "@/lib/slots";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(dateStr: string, n: number): string {
  const d = parseKstDate(dateStr);
  return formatKstDate(new Date(d.getTime() + n * 86400000));
}
function kstParts(dateStr: string) {
  const kst = new Date(parseKstDate(dateStr).getTime() + 9 * 3600000);
  return { dow: kst.getUTCDay(), date: kst.getUTCDate(), month: kst.getUTCMonth() + 1 };
}
function mondayOf(dateStr: string): string {
  const { dow } = kstParts(dateStr);
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

// 스와이프 판정: 수평 이동이 이 값 이상이고 수직 이동보다 확실히 클 때만 주 이동
const SWIPE_MIN_X = 48;
const SWIPE_XY_RATIO = 1.5;
// 이 값을 넘어야 드래그로 잠그고 트랙을 손가락에 붙인다 (미만이면 탭/세로 스크롤에 양보)
const DRAG_LOCK_X = 10;
// 경계 주(disabled 방향)로 끌 때 러버밴드 감쇠율
const RUBBER_BAND = 0.3;
const SLIDE_MS = 280;
const SLIDE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

// 트랙은 [이전 주 | 현재 주 | 다음 주] 3-pane. translateX %는 pane(w-full) 폭 기준.
type Phase = { t: "idle" } | { t: "animating"; dir: -1 | 1; from: string };

export function WeekStrip({ selectedDateStr }: { selectedDateStr: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>({ t: "idle" });
  // 낙관적 상태: 커밋 즉시 새 주/선택일을 보여주고, 서버가 따라잡으면 클리어
  const [pendingMonday, setPendingMonday] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false); // 드래그 발생 여부 — 잔여 click 차단에도 사용
  const dragX = useRef(0);
  const animTarget = useRef<string | null>(null); // 진행 중 슬라이드의 목표 monday
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const propMonday = mondayOf(selectedDateStr);

  // pending 클리어 (렌더 중 상태 조정 패턴). 두 경우 서버 진실을 따른다:
  // 1) 서버가 낙관적 주를 따라잡음 — student/book은 서버가 날짜를 예약창으로 clamp할 수
  //    있어 날짜가 아닌 monday로 비교. 내비게이션 진행 중(isPending)의 불일치는 아직
  //    이전 페이로드일 수 있으므로 유지(last-push-wins).
  // 2) 내비게이션·슬라이드가 모두 끝났는데 불일치 — 서버가 다른 주로 확정(clamp)했거나
  //    내비게이션 실패 → 낙관적 주를 버리고 서버 주로 복귀.
  if (
    pendingMonday &&
    (propMonday === pendingMonday || (!isPending && phase.t === "idle"))
  ) {
    setPendingMonday(null);
    setPendingDate(null);
  }

  // 트랙 중앙 pane의 주. 슬라이드 중엔 출발 주를 유지해야 서버 응답이 먼저 와도 안 튄다.
  const baseMonday = pendingMonday ?? (phase.t === "animating" ? phase.from : propMonday);
  // 사용자에게 "현재"로 보이는 주 — 헤더 라벨·disabled 판정·화살표 목적지 기준
  const shownMonday = phase.t === "animating" ? addDays(baseMonday, 7 * phase.dir) : baseMonday;
  const effSelected = pendingDate ?? selectedDateStr;
  const todayStr = formatKstDate(new Date());

  // 예약 가능 창: 이번 주 ~ 4주차. 낙관적 주 기준으로 판정해야 연속 스와이프로 창 밖 이탈 불가.
  const { mondayStr: thisWeekMonday, maxDateStr } = bookingHorizon(new Date());
  const prevDisabled = shownMonday <= thisWeekMonday;
  const nextDisabled = addDays(shownMonday, 7) > maxDateStr;

  const firstP = kstParts(shownMonday);
  const lastP = kstParts(addDays(shownMonday, 6));
  const rangeLabel =
    firstP.month === lastP.month
      ? `${firstP.month}월 ${firstP.date}–${lastP.date}일`
      : `${firstP.month}월 ${firstP.date}일 – ${lastP.month}월 ${lastP.date}일`;

  const hrefFor = (date: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("date", date);
    return `${pathname}?${sp.toString()}`;
  };

  const setTrackTransform = (transform: string, transition: string) => {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = transform;
  };

  const finalizeNow = () => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
    const target = animTarget.current;
    if (target == null) return;
    animTarget.current = null;
    // 중앙 pane 교체와 -100% 리센터가 같은 커밋에 페인트되어 무점프
    setPendingMonday(target);
    setPhase({ t: "idle" });
  };

  const commit = (dir: -1 | 1) => {
    const targetMonday = addDays(shownMonday, 7 * dir);
    const targetDate = addDays(effSelected, 7 * dir);
    setPendingDate(targetDate);
    // 서버 왕복은 슬라이드와 병행. scroll:false — 주 이동에 스크롤 점프 금지.
    startTransition(() => {
      router.push(hrefFor(targetDate), { scroll: false });
    });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || phase.t === "animating") {
      // 동작 줄이기, 또는 슬라이드 중 재커밋(동일 transform 값이라 transition이 안 걸림) → 즉시 스왑
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
      animTarget.current = null;
      setPendingMonday(targetMonday);
      setPhase({ t: "idle" });
      setTrackTransform("translateX(-100%)", "none");
      return;
    }
    animTarget.current = targetMonday;
    setPhase({ t: "animating", dir, from: shownMonday });
    fallbackTimer.current = setTimeout(finalizeNow, SLIDE_MS + 80);
  };

  const snapBack = () => {
    setTrackTransform("translateX(-100%)", `transform 200ms ${SLIDE_EASE}`);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) return;
    if (phase.t === "animating") finalizeNow(); // 연속 스와이프: 즉시 스냅 완료 후 새 드래그
    dragging.current = false;
    dragX.current = 0;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  // touch-pan-y가 수평 제스처의 브라우저 스크롤을 막아주므로 preventDefault 불필요.
  // 프레임당 리렌더를 피하려고 setState 없이 트랙 style을 직접 조작한다.
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!dragging.current) {
      if (Math.abs(dx) < DRAG_LOCK_X || Math.abs(dx) <= Math.abs(dy) * SWIPE_XY_RATIO) return;
      dragging.current = true;
    }
    const blocked = dx < 0 ? nextDisabled : prevDisabled;
    dragX.current = blocked ? dx * RUBBER_BAND : dx;
    setTrackTransform(`translateX(calc(-100% + ${dragX.current}px))`, "none");
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !dragging.current) return; // 탭이면 click이 정상 통과
    const dx = e.changedTouches[0].clientX - start.x;
    const dir: -1 | 1 = dx < 0 ? 1 : -1;
    const blocked = dir === 1 ? nextDisabled : prevDisabled;
    if (Math.abs(dx) >= SWIPE_MIN_X && !blocked) commit(dir);
    else snapBack();
  };

  const onTouchCancel = () => {
    touchStart.current = null;
    if (dragging.current) snapBack();
  };

  // 드래그로 판정된 터치의 잔여 click이 날짜 링크를 누르지 않도록 차단 (스냅백된 드래그 포함)
  const onClickCapture = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // 드래그 중 외부 리렌더(이전 내비게이션 페이로드 도착 등)가 style prop으로
  // 직접 조작한 transform을 덮어쓰면 손가락 위치로 재동기화
  useLayoutEffect(() => {
    if (touchStart.current && dragging.current) {
      setTrackTransform(`translateX(calc(-100% + ${dragX.current}px))`, "none");
    }
  });

  useEffect(() => {
    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, []);

  const trackStyle: React.CSSProperties =
    phase.t === "animating"
      ? {
          transform: `translateX(${phase.dir === 1 ? "-200%" : "0%"})`,
          transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}`,
        }
      : { transform: "translateX(-100%)", transition: "none" };

  const onTransitionEnd = (e: React.TransitionEvent) => {
    if (e.target === trackRef.current && e.propertyName === "transform") finalizeNow();
  };

  const arrowLink = (dir: -1 | 1) => (
    <Link
      href={hrefFor(addDays(effSelected, 7 * dir))}
      aria-label={dir === 1 ? "다음 주" : "이전 주"}
      onNavigate={(e) => {
        // same-tab 내비게이션만 슬라이드 경로로 (Cmd+클릭 새 탭은 onNavigate 미발화 → href 그대로)
        e.preventDefault();
        commit(dir);
      }}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {dir === 1 ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
    </Link>
  );
  const arrowDisabled = (dir: -1 | 1) => (
    <span
      aria-disabled
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40"
    >
      {dir === 1 ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
    </span>
  );

  return (
    <div
      className="touch-pan-y rounded-lg border bg-card"
      data-week-pending={isPending || pendingMonday !== null ? "" : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onClickCapture={onClickCapture}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        {prevDisabled ? arrowDisabled(-1) : arrowLink(-1)}
        <span className="text-sm font-medium tabular-nums">{rangeLabel}</span>
        {nextDisabled ? arrowDisabled(1) : arrowLink(1)}
      </div>
      <div className="overflow-hidden border-t">
        <div
          ref={trackRef}
          className="flex w-full"
          style={trackStyle}
          onTransitionEnd={onTransitionEnd}
        >
          {[-7, 0, 7].map((offset) => {
            const monday = addDays(baseMonday, offset);
            const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
            return (
              <div key={monday} className="grid w-full shrink-0 grid-cols-7">
                {days.map((day) => {
                  const p = kstParts(day);
                  const selected = day === effSelected;
                  const isToday = day === todayStr;
                  const isSun = p.dow === 0;
                  const isSat = p.dow === 6;
                  const isWeekend = isSat || isSun;
                  return (
                    <Link
                      key={day}
                      href={hrefFor(day)}
                      aria-current={selected ? "date" : undefined}
                      className={cn(
                        "flex flex-col items-center gap-1 py-2.5 text-center transition-colors",
                        !selected && isWeekend && "bg-muted/60",
                        !selected && "hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          selected
                            ? "text-primary"
                            : isSun
                              ? "text-destructive/70"
                              : isSat
                                ? "text-chart-4"
                                : "text-muted-foreground",
                        )}
                      >
                        {DOW[p.dow]}
                      </span>
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full font-mono text-sm tabular-nums transition-colors",
                          selected
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-foreground",
                          !selected && isToday && "ring-1 ring-primary/40",
                        )}
                      >
                        {p.date}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
