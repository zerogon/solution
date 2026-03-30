-- CreateTable
CREATE TABLE "manuscripts" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manuscripts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "manuscripts" ADD CONSTRAINT "manuscripts_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
