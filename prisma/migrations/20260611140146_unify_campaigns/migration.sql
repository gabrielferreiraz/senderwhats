/*
  Warnings:

  - You are about to drop the `ScheduledMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ScheduledMessage" DROP CONSTRAINT "ScheduledMessage_vendedorId_fkey";

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "customMessage" TEXT,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "ScheduledMessage";

-- DropEnum
DROP TYPE "ScheduledStatus";

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");
