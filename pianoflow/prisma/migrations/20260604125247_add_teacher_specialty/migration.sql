-- CreateEnum
CREATE TYPE "Specialty" AS ENUM ('CLASSICAL', 'JAZZ', 'ACCOMPANIMENT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "specialties" "Specialty"[] DEFAULT ARRAY[]::"Specialty"[];

-- Backfill: 시드된 선생님 전공 (이소연/이승준=클래식, 한상아=재즈·반주)
UPDATE "users" SET "specialties" = ARRAY['CLASSICAL']::"Specialty"[]
  WHERE "role" = 'TEACHER' AND "name" IN ('이소연', '이승준');
UPDATE "users" SET "specialties" = ARRAY['JAZZ', 'ACCOMPANIMENT']::"Specialty"[]
  WHERE "role" = 'TEACHER' AND "name" = '한상아';
