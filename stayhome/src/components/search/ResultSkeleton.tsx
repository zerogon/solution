import { Skeleton } from "@/components/ui/skeleton";

/**
 * 조회 중 표시. 기존에는 "조회 중…" 한 줄이라 결과가 몇 개나 올지 감이 없었다.
 * 실제 결과와 같은 골격을 그려서 레이아웃이 튀지 않게 한다.
 */
export function ResultSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="조회 중">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-1.5">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
