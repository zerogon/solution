-- 입사일 기준 연차 회차 (2026-09-10).
--
-- 연차 잔액의 단위를 **캘린더 연도 → 입사일 기준 회차**로 옮긴다.
-- 유니크 키는 파생값인 year가 아니라 불변 신원인 period_index다 — 입사일을 고치면
-- year는 통째로 이동하지만(2025행이 2026행과 충돌) period_index는 그대로 남는다.
-- 손으로 손질한 마이그레이션이라 시드된 로컬 DB 위에서도 그대로 적용된다.

-- 1. 회차 메타 (일단 nullable — 백필 후 NOT NULL로 승격)
ALTER TABLE "leave_balances"
  ADD COLUMN "period_index" INTEGER,
  ADD COLUMN "period_start" DATE,
  ADD COLUMN "period_end"   DATE;

-- 2. 입사일이 있는 행을 입사기념일 회차로 옮긴다.
--    Postgres의 date + interval '1 year'는 2024-02-29 → 2025-02-28로 클램프한다 —
--    src/lib/utils.ts의 addMonthsIso와 같은 규칙이라 앱/DB 계산이 어긋나지 않는다.
UPDATE "leave_balances" b SET
  "period_index" = (b."year" - EXTRACT(YEAR FROM u."hire_date")::int) + 1,
  "period_start" = (u."hire_date" + make_interval(years => b."year" - EXTRACT(YEAR FROM u."hire_date")::int))::date,
  "period_end"   = ((u."hire_date" + make_interval(years => b."year" - EXTRACT(YEAR FROM u."hire_date")::int + 1))::date - 1)
FROM "users" u
WHERE u."id" = b."user_id"
  AND u."hire_date" IS NOT NULL
  AND b."year" >= EXTRACT(YEAR FROM u."hire_date")::int;

-- 3. 나머지(입사일 없음 / 입사 이전 연도)는 회차가 정의되지 않는다 → 음수 센티널.
--    -2026 = 옛 2026년 행. 같은 직원의 레거시 행끼리도 값이 달라 유니크 충돌이 없다.
UPDATE "leave_balances" SET
  "period_index" = -"year",
  "period_start" = make_date("year", 1, 1),
  "period_end"   = make_date("year", 12, 31)
WHERE "period_index" IS NULL;

ALTER TABLE "leave_balances"
  ALTER COLUMN "period_index" SET NOT NULL,
  ALTER COLUMN "period_start" SET NOT NULL,
  ALTER COLUMN "period_end"   SET NOT NULL;

-- 4. total_days: NOT NULL DEFAULT 0 → nullable. **null이 "자동 계산"을 뜻한다.**
--    기존 값은 그대로 두어 전부 "수동 부여"로 보존한다 — 배포만으로 기존 숫자가 조용히
--    바뀌지 않게. 관리자가 행마다 "자동 계산 사용"을 켜서 옮겨간다.
ALTER TABLE "leave_balances"
  ALTER COLUMN "total_days" DROP DEFAULT,
  ALTER COLUMN "total_days" DROP NOT NULL;

-- 5. 유니크 키 교체: (user_id, year) → (user_id, period_index)
DROP INDEX "leave_balances_user_id_year_key";
ALTER TABLE "leave_balances" DROP COLUMN "year";
CREATE UNIQUE INDEX "leave_balances_user_id_period_index_key" ON "leave_balances"("user_id", "period_index");

-- 6. 신청 → 회차 직접 연결. 취소가 회차를 재유도하지 않게 하는 장치다.
--    백필은 옛 규칙(시작일의 캘린더 연도)을 쓴다 — 2번에서 그 행이 회차로 재라벨됐으므로
--    행 id는 그대로고, 이 신청의 취소는 계속 정확히 같은 행으로 되돌아간다.
ALTER TABLE "leave_requests" ADD COLUMN "leave_balance_id" TEXT;
UPDATE "leave_requests" r SET "leave_balance_id" = b."id"
FROM "leave_balances" b, "users" u
WHERE b."user_id" = r."user_id"
  AND u."id" = r."user_id"
  AND b."period_index" = CASE
        WHEN u."hire_date" IS NOT NULL
             AND EXTRACT(YEAR FROM r."start_date")::int >= EXTRACT(YEAR FROM u."hire_date")::int
        THEN (EXTRACT(YEAR FROM r."start_date")::int - EXTRACT(YEAR FROM u."hire_date")::int) + 1
        ELSE -EXTRACT(YEAR FROM r."start_date")::int
      END;

CREATE INDEX "leave_requests_leave_balance_id_idx" ON "leave_requests"("leave_balance_id");
ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_leave_balance_id_fkey"
  FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. 조정 이력도 같은 회차 규약으로.
ALTER TABLE "leave_adjustments" ADD COLUMN "period_index" INTEGER;
UPDATE "leave_adjustments" a SET "period_index" = CASE
    WHEN u."hire_date" IS NOT NULL AND a."year" >= EXTRACT(YEAR FROM u."hire_date")::int
    THEN (a."year" - EXTRACT(YEAR FROM u."hire_date")::int) + 1
    ELSE -a."year"
  END
FROM "users" u WHERE u."id" = a."user_id";
UPDATE "leave_adjustments" SET "period_index" = -"year" WHERE "period_index" IS NULL;
ALTER TABLE "leave_adjustments" ALTER COLUMN "period_index" SET NOT NULL;

DROP INDEX "leave_adjustments_user_id_year_idx";
ALTER TABLE "leave_adjustments" DROP COLUMN "year";
CREATE INDEX "leave_adjustments_user_id_period_index_idx" ON "leave_adjustments"("user_id", "period_index");
