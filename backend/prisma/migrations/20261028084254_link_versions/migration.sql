-- AlterTable
ALTER TABLE "Flat" ADD COLUMN     "link_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "link_version" INTEGER NOT NULL DEFAULT 1;
