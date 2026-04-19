/*
  Warnings:

  - A unique constraint covering the columns `[fullname]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "users_fullname_key" ON "users"("fullname");
