/*
  Warnings:

  - You are about to drop the `DailyNote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DailyNote" DROP CONSTRAINT "DailyNote_userId_fkey";

-- DropTable
DROP TABLE "DailyNote";
