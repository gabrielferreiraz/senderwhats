-- AlterTable
ALTER TABLE "TemplateStep" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "stepType" TEXT NOT NULL DEFAULT 'text';
