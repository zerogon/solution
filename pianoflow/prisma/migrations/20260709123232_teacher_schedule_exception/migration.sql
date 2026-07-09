-- CreateTable
CREATE TABLE "teacher_schedule_exception" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_schedule_exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_schedule_exception_teacher_id_date_key" ON "teacher_schedule_exception"("teacher_id", "date");

-- AddForeignKey
ALTER TABLE "teacher_schedule_exception" ADD CONSTRAINT "teacher_schedule_exception_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
