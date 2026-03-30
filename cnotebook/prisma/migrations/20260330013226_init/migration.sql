-- CreateTable
CREATE TABLE "works" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "gender" TEXT,
    "birthday" TEXT,
    "age" INTEGER,
    "height" INTEGER,
    "weight" INTEGER,
    "hair_color" TEXT,
    "hair_style" TEXT,
    "eye_color" TEXT,
    "personality" TEXT,
    "features" TEXT,
    "region" TEXT,
    "affiliation" TEXT,
    "foreshadowing" TEXT,
    "death" TEXT,
    "notes" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_characters" (
    "folder_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,

    CONSTRAINT "folder_characters_pkey" PRIMARY KEY ("folder_id","character_id")
);

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_characters" ADD CONSTRAINT "folder_characters_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_characters" ADD CONSTRAINT "folder_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
