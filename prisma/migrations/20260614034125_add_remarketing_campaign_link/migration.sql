-- AlterTable
ALTER TABLE "RemarketingLead" ADD COLUMN     "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "RemarketingLead_campaignId_status_idx" ON "RemarketingLead"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "RemarketingLead" ADD CONSTRAINT "RemarketingLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
