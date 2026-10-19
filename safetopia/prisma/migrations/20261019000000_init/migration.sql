-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('FULL_DAY', 'AM_HALF', 'PM_HALF');

-- CreateTable
CREATE TABLE "owner" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "closed_weekdays" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_years" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "granted_days" DOUBLE PRECISION NOT NULL,
    "carried_over_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_entries" (
    "id" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "manual_days" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_entry_days" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "LeaveType" NOT NULL,

    CONSTRAINT "leave_entry_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_years_year_key" ON "leave_years"("year");

-- CreateIndex
CREATE INDEX "leave_entries_start_date_idx" ON "leave_entries"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_entry_days_date_key" ON "leave_entry_days"("date");

-- CreateIndex
CREATE INDEX "leave_entry_days_entry_id_idx" ON "leave_entry_days"("entry_id");

-- AddForeignKey
ALTER TABLE "leave_entry_days" ADD CONSTRAINT "leave_entry_days_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "leave_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

