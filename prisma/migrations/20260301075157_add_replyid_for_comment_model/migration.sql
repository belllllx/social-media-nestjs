-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "reply_id" TEXT;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
