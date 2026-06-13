-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "enableRemarketing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxSendsPerDay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CampaignMessage" ADD COLUMN     "replied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RemarketingConfig" ADD COLUMN     "maxPerDay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RemarketingLead" ADD COLUMN     "lastSentAt" TIMESTAMP(3),
ADD COLUMN     "replied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "repliedAt" TIMESTAMP(3);
