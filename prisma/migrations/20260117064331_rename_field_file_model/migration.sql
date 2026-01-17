/*
  Warnings:

  - You are about to drop the column `file_url` on the `files` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[content_id,content_type,file_name]` on the table `files` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `file_name` to the `files` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "files_content_id_content_type_file_url_key";

-- AlterTable
ALTER TABLE "files" DROP COLUMN "file_url",
ADD COLUMN     "file_name" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "files_content_id_content_type_file_name_key" ON "files"("content_id", "content_type", "file_name");
