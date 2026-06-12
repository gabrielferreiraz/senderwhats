-- DropForeignKey
ALTER TABLE "CampaignMessage" DROP CONSTRAINT "CampaignMessage_campaignId_fkey";

-- AddForeignKey
ALTER TABLE "CampaignMessage" ADD CONSTRAINT "CampaignMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
