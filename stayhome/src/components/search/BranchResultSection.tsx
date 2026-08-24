import { ExternalLink, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  TONE_BADGE,
  TONE_DOT,
  TONE_LABEL,
  TONE_ORDER,
  TONE_SURFACE,
  toneOf,
} from "@/lib/availability-tone";
import { checkedLabel, syncedLabel } from "@/lib/freshness";
import type { InventoryRow } from "./types";

/**
 * 한 지점의 결과 묶음.
 *
 * 기존에는 지점 구분 없이 카드가 일렬로 쌓여서, 전체 조회 시 어느 지점 객실인지
 * 각 행의 메타 줄을 읽어야만 알 수 있었다. 지점을 섹션 머리로 올리고 객실은
 * 그 아래 조밀한 목록으로 내린다.
 */
export function BranchResultSection({
  rows,
  now,
}: {
  rows: InventoryRow[];
  /**
   * 신선도 기준 시각. 호출부에서 한 번만 정해 내려보낸다 — 행마다 `Date.now()`를
   * 부르면 임계값 경계의 행들이 서로 다른 등급을 받고, 리렌더마다 값이 흔들린다.
   */
  now: number;
}) {
  const head = rows[0];

  const tones = new Map(rows.map((r) => [r.id, toneOf(r, now)]));
  const availableCount = rows.filter(
    (r) => tones.get(r.id) === "available" || tones.get(r.id) === "closingSoon",
  ).length;
  const unverifiedCount = rows.filter((r) => tones.get(r.id) === "unverified").length;

  // 확인된 가용 → 마감임박 → 확인 필요 → 마감. 같은 상태 안에서는 객실명 가나다순.
  const sorted = [...rows].sort((a, b) => {
    const d = TONE_ORDER[tones.get(a.id)!] - TONE_ORDER[tones.get(b.id)!];
    return d !== 0 ? d : a.roomType.localeCompare(b.roomType, "ko");
  });

  // 지점 안에서 갱신 시각이 섞일 수 있으므로 가장 오래된 것을 대표로 보여준다.
  // 이 값 하나로는 "어느 행이 낡았는지"를 말할 수 없어서 — 실제로 오늘 갱신된 16행과
  // 13일 된 3행이 이 헤더 아래 나란히 있었다 — 낡은 행 수를 함께 낸다. 행 단위 판정은
  // 아래 목록의 배지가 한다.
  const oldestSync = rows.reduce(
    (acc, r) => (r.syncedAt < acc ? r.syncedAt : acc),
    head.syncedAt,
  );

  return (
    // 리조트명은 항상 함께 렌더한다. 롯데는 branchName에 브랜드가 들어 있어 생략했었지만
    // ("롯데리조트 속초") 그건 롯데 한정 가정이다 — 같은 롯데의 "롯데호텔앤리조트 김해"도
    // Resort.name("롯데리조트")과 다르고, 한화의 "설악 쏘라노"류는 브랜드가 아예 없다.
    <section id={`branch-${head.branchName}`} className="scroll-mt-8 space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">
            {head.resortName}
          </span>
          <h2 className="min-w-0 truncate font-heading text-base font-semibold tracking-tight">
            {head.branchName}
          </h2>
          <Badge variant="secondary" className="shrink-0 gap-1">
            <MapPin className="size-3" />
            {head.region}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono tabular-nums">
            예약 가능 {availableCount}/{rows.length}
          </span>
          {unverifiedCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono tabular-nums text-slate-600">
                확인 필요 {unverifiedCount}
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{syncedLabel(oldestSync, now)}</span>
        </div>
      </header>

      {/* 넓은 화면에서 한 줄짜리 객실 행이 세로로만 쌓이면 결과 컬럼이 텅 비어 보인다. */}
      <ul className="grid gap-1.5 2xl:grid-cols-2">
        {sorted.map((row) => {
          const tone = tones.get(row.id)!;
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                TONE_SURFACE[tone],
              )}
            >
              <span
                className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {row.roomType}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  TONE_BADGE[tone],
                )}
                // 강등된 행은 배지가 상태가 아니라 나이를 말한다. 왜 등급이 내려갔는지는
                // 배지 자체로는 알 수 없으므로 title에 원래 기록을 남긴다.
                title={
                  tone === "unverified"
                    ? `마지막 수집 시점에는 ${row.closingSoon ? "마감임박" : "예약 가능"}이었습니다. 실제 예약 가능 여부는 최신화 후 확인하세요.`
                    : undefined
                }
              >
                {tone === "unverified"
                  ? checkedLabel(row.syncedAt, now)
                  : TONE_LABEL[tone]}
              </span>
              {row.detailUrl && (
                <a
                  href={row.detailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${row.roomType} 예약 페이지 열기`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
