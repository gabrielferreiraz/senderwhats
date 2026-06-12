-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "templates" JSONB;

-- AlterTable
ALTER TABLE "CampaignMessage" ADD COLUMN     "templateId" TEXT;

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
