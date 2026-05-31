-- AlterTable
ALTER TABLE "teacher_availability" ADD COLUMN     "hours" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enrollment_end" TIMESTAMP(3),
ADD COLUMN     "enrollment_start" TIMESTAMP(3);

-- 기존 가용 요일 행은 시간 정보가 없으므로 전체 예약 가능 시간(10~22시)으로 백필 → 기존 동작 유지
UPDATE "teacher_availability"
  SET "hours" = ARRAY[10,11,12,13,14,15,16,17,18,19,20,21,22]
  WHERE "hours" = ARRAY[]::INTEGER[];
