"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, TrendingUp, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { addMonth } from "@/lib/month";
import { teacherColorVar, TEACHER_CHART_VARS } from "@/lib/teacher-colors";
import { TREND_SPAN, type TeacherLessonTrend } from "@/lib/lesson-trend";
import { getTeacherLessonTrend } from "@/actions/admin-stats";

interface Props {
  initial: TeacherLessonTrend;
  currentMonth: string;
}

/** 직접 라벨을 그릴 수 있는 최대 시리즈 수 — 초과 시 상위 N + 기타로 폴딩 */
const MAX_SERIES = 5;
const FOLD_TOP = 4;

interface DisplaySeries {
  name: string;
  counts: number[];
  color: string;
}

export function TeacherLessonTrend({ initial, currentMonth }: Props) {
  const [data, setData] = useState<TeacherLessonTrend>(initial);
  const [pending, startTransition] = useTransition();

  function load(nextEndMonth: string) {
    startTransition(async () => {
      try {
        const res = await getTeacherLessonTrend(nextEndMonth);
        setData(res);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.",
        );
      }
    });
  }

  const { endMonth, months, series } = data;
  const [yy, mm] = endMonth.split("-");
  const monthLabel = `${yy}년 ${Number(mm)}월`;
  const isCurrent = endMonth === currentMonth;

  // 선생님이 많으면 6개월 합계 상위 FOLD_TOP명 + "기타"(회색)로 폴딩.
  // 색 인덱스는 전체 name asc 순번(도트와 동일 계약) — 폴딩 없을 때는 재배색이 없다.
  const displaySeries = useMemo<DisplaySeries[]>(() => {
    if (series.length <= MAX_SERIES) {
      return series.map((s, i) => ({ ...s, color: teacherColorVar(i) }));
    }
    const ranked = series
      .map((s, i) => ({ s, i, total: s.counts.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    const top = ranked
      .slice(0, FOLD_TOP)
      .sort((a, b) => a.i - b.i) // 상위끼리는 name asc 순서 유지
      .map(({ s }, rank) => ({ ...s, color: TEACHER_CHART_VARS[rank] }));
    const rest = ranked.slice(FOLD_TOP);
    const etc: DisplaySeries = {
      name: `기타 ${rest.length}명`,
      counts: months.map((_, mi) =>
        rest.reduce((sum, { s }) => sum + s.counts[mi], 0),
      ),
      color: "var(--chart-4)",
    };
    return [...top, etc];
  }, [series, months]);

  const total = series.reduce(
    (sum, s) => sum + s.counts.reduce((a, b) => a + b, 0),
    0,
  );

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>레슨 추이</CardTitle>
          <span className="text-sm text-muted-foreground">최근 6개월</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(addMonth(endMonth, -1))}
            disabled={pending}
            aria-label="이전 달"
            className={buttonVariants({ size: "icon-sm", variant: "outline" })}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-medium">
            {monthLabel}까지
          </span>
          <button
            type="button"
            onClick={() => load(addMonth(endMonth, 1))}
            disabled={pending}
            aria-label="다음 달"
            className={buttonVariants({ size: "icon-sm", variant: "outline" })}
          >
            <ChevronRight className="size-4" />
          </button>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => load(currentMonth)}
              disabled={pending}
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              이번 달
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <EmptyState icon={Users} title="선생님이 없습니다" />
        ) : total === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="표시할 레슨이 없습니다"
            description={`${months[0]} ~ ${endMonth} 활성 예약 기준`}
          />
        ) : (
          <div
            className={`transition-opacity ${pending ? "opacity-50" : ""}`}
          >
            <TrendChart months={months} series={displaySeries} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {displaySeries.map((s) => (
                <span key={s.name} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-xs text-foreground">{s.name}</span>
                </span>
              ))}
            </div>
            <table className="sr-only">
              <caption>최근 6개월 선생님별 레슨 추이</caption>
              <thead>
                <tr>
                  <th scope="col">선생님</th>
                  {months.map((m) => (
                    <th key={m} scope="col">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.name}>
                    <th scope="row">{s.name}</th>
                    {s.counts.map((c, i) => (
                      <td key={i}>{c}건</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const H = 240;
const PAD_T = 12;
const PAD_B = 26;
const PAD_L = 36;
const LABEL_GAP = 14;

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** rawStep 이상인 첫 nice step ([1,2,5]×10^k) */
function niceStep(rawStep: number): number {
  let pow = 1;
  for (;;) {
    for (const base of [1, 2, 5]) {
      const step = base * pow;
      if (step >= rawStep) return step;
    }
    pow *= 10;
  }
}

function TrendChart({
  months,
  series,
}: {
  months: string[];
  series: DisplaySeries[];
}) {
  const [wrapRef, width] = useContainerWidth();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const last = TREND_SPAN - 1;
  const max = Math.max(1, ...series.flatMap((s) => s.counts));
  const step = niceStep(max / 3);
  const yMax = step * Math.ceil(max / step);
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);

  const padR = series.length <= MAX_SERIES ? 96 : 16;
  const innerW = Math.max(0, width - PAD_L - padR);
  const xStep = innerW / last;
  const x = (i: number) => PAD_L + i * xStep;
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / yMax);

  // 선 끝 직접 라벨 — 끝값 y 기준 정렬 후 겹치면 아래로 밀고, 바닥 넘치면 다시 위로
  const endLabels = series
    .map((s) => ({ name: s.name, color: s.color, y: y(s.counts[last]) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < LABEL_GAP) {
      endLabels[i].y = endLabels[i - 1].y + LABEL_GAP;
    }
  }
  const floor = H - PAD_B - 2;
  for (let i = endLabels.length - 1; i >= 0; i--) {
    const limit = floor - (endLabels.length - 1 - i) * LABEL_GAP;
    if (endLabels[i].y > limit) endLabels[i].y = limit;
  }

  const spansYears = months[0].slice(0, 4) !== months[last].slice(0, 4);
  const xLabel = (m: string, i: number) => {
    const monthNum = `${Number(m.slice(5))}월`;
    if (spansYears && (i === 0 || m.slice(5) === "01")) {
      return `'${m.slice(2, 4)} ${monthNum}`;
    }
    return monthNum;
  };

  function idxFromClientX(clientX: number): number {
    const rect = svgRef.current!.getBoundingClientRect();
    const raw = Math.round((clientX - rect.left - PAD_L) / xStep);
    return Math.min(last, Math.max(0, raw));
  }

  const flip = hoverIdx !== null && hoverIdx >= TREND_SPAN / 2;

  return (
    <div
      ref={wrapRef}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
      tabIndex={0}
      role="img"
      aria-label="최근 6개월 선생님별 레슨 추이 꺾은선 차트 — 상세 수치는 다음 표 참고"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setHoverIdx((p) => (p === null ? 0 : Math.min(last, p + 1)));
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setHoverIdx((p) => (p === null ? last : Math.max(0, p - 1)));
        } else if (e.key === "Escape") {
          setHoverIdx(null);
        }
      }}
      onBlur={() => setHoverIdx(null)}
    >
      {width === 0 ? (
        <div style={{ height: H }} />
      ) : (
        <svg ref={svgRef} width={width} height={H} aria-hidden>
          {/* 그리드 + y축 라벨 */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={width - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--muted-foreground)"
                className="font-mono text-xs tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}
          {/* x축 라벨 */}
          {months.map((m, i) => (
            <text
              key={m}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              className="font-mono text-xs tabular-nums"
            >
              {xLabel(m, i)}
            </text>
          ))}
          {/* 크로스헤어 */}
          {hoverIdx !== null && (
            <line
              x1={x(hoverIdx)}
              x2={x(hoverIdx)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              opacity={0.4}
            />
          )}
          {/* 시리즈 라인 */}
          {series.map((s) => (
            <polyline
              key={s.name}
              points={s.counts.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* 포인트 (전 라인 위에 일괄 — 카드 배경 링으로 겹침 구분) */}
          {series.map((s) =>
            s.counts.map((v, i) => (
              <circle
                key={`${s.name}-${i}`}
                cx={x(i)}
                cy={y(v)}
                r={hoverIdx === i ? 5 : 4}
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={2}
              />
            )),
          )}
          {/* 선 끝 직접 라벨 — 텍스트는 텍스트 토큰, 색은 도트가 담당 */}
          {series.length <= MAX_SERIES &&
            endLabels.map((l) => (
              <g key={l.name}>
                <circle cx={x(last) + 12} cy={l.y} r={3} fill={l.color} />
                <text
                  x={x(last) + 20}
                  y={l.y}
                  dominantBaseline="central"
                  fill="var(--foreground)"
                  className="text-xs"
                >
                  {l.name}
                </text>
              </g>
            ))}
          {/* 히트 레이어 — 월 컬럼 밴드 스냅 */}
          <rect
            x={0}
            y={0}
            width={width}
            height={H}
            fill="transparent"
            onPointerMove={(e) => setHoverIdx(idxFromClientX(e.clientX))}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
      )}
      {/* 툴팁 */}
      {hoverIdx !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-28 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            top: PAD_T,
            left: flip ? undefined : x(hoverIdx) + 10,
            right: flip ? width - x(hoverIdx) + 10 : undefined,
          }}
        >
          <p className="mb-1 font-medium">{xLabel(months[hoverIdx], hoverIdx)}</p>
          <div className="space-y-0.5">
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="ml-auto pl-2 font-medium tabular-nums text-foreground">
                  {s.counts[hoverIdx]}건
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
