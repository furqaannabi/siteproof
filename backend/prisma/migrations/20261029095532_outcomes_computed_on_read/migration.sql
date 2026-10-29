/*
  Warnings:

  - You are about to drop the `Result` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Result" DROP CONSTRAINT "Result_claim_id_fkey";

-- DropTable
DROP TABLE "Result";

-- DropEnum
DROP TYPE "Outcome";
