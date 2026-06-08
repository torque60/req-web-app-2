-- AlterTable
ALTER TABLE "MdFile" ADD COLUMN     "docState" JSONB,
ADD COLUMN     "messages" JSONB,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "questionIndex" INTEGER;
