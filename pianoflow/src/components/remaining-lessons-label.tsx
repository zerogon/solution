/**
 * 남은 횟수 표기: 오늘 기준 실제 소진분만 차감된 값을 보여주고,
 * 미래 예약에 잡혀 있는 횟수는 "예약됨 M회"로 병기한다.
 * remaining = DB 잔액(remainingLessons), reserved = 미래 ACTIVE 예약 중 차감분.
 */
export function RemainingLessonsLabel({
  remaining,
  reserved,
}: {
  remaining: number;
  reserved: number;
}) {
  return (
    <span className="tabular-nums">
      남은 {remaining + reserved}회
      {reserved > 0 && (
        <span className="text-muted-foreground"> · 예약됨 {reserved}회</span>
      )}
    </span>
  );
}
