-- 입사일 기준 연차 회차 (2026-11-06). 연도별 부여(leave_years)를 회차별 조정(leave_periods)으로 바꾼다.
-- leave_years의 값은 회차 모델로 옮길 수 없다(기간이 다르다) — 배포 전에 적어 두고 설정에서 다시 넣는다.

-- AlterTable
ALTER TABLE "owner" ADD COLUMN "hire_date" DATE;

-- CreateTable
CREATE TABLE "leave_periods" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "carried_over_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjusted_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_periods_index_key" ON "leave_periods"("index");

-- DropTable
DROP TABLE "leave_years";
