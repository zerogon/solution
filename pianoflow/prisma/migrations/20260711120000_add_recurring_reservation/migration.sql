-- CreateTable
CREATE TABLE "recurring_reservations" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "hour" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "materialized_until" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_reservations_active_idx" ON "recurring_reservations"("active");

-- CreateIndex
CREATE INDEX "recurring_reservations_student_id_idx" ON "recurring_reservations"("student_id");

-- 활성 고정 예약 부분 유니크: 한 선생님의 한 물리 슬롯(요일·시각)엔 활성 고정 하나.
-- active=false(소프트 삭제)는 인덱스에서 제외되어 슬롯 재사용이 가능합니다.
CREATE UNIQUE INDEX "recurring_teacher_slot_active_uniq"
  ON "recurring_reservations" ("teacher_id", "weekday", "hour")
  WHERE "active" = true;

-- 한 학생이 같은 요일·시각에 활성 고정을 둘 이상 가질 수 없습니다.
CREATE UNIQUE INDEX "recurring_student_slot_active_uniq"
  ON "recurring_reservations" ("student_id", "weekday", "hour")
  WHERE "active" = true;

-- AddForeignKey
ALTER TABLE "recurring_reservations" ADD CONSTRAINT "recurring_reservations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_reservations" ADD CONSTRAINT "recurring_reservations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reservation 역참조 (고정 배지 판별용)
ALTER TABLE "reservations" ADD COLUMN "recurring_id" TEXT;

-- CreateIndex
CREATE INDEX "reservations_recurring_id_idx" ON "reservations"("recurring_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
