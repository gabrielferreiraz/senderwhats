-- CreateTable
CREATE TABLE "RemarketingConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxFollowUps" INTEGER NOT NULL DEFAULT 3,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "allowedDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "windowStart" TEXT NOT NULL DEFAULT '09:00',
    "windowEnd" TEXT NOT NULL DEFAULT '18:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/Campo_Grande',
    "scripts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemarketingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemarketingLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "nextRun" TIMESTAMP(3) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemarketingLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemarketingConfig_userId_key" ON "RemarketingConfig"("userId");

-- CreateIndex
CREATE INDEX "RemarketingLead_status_nextRun_idx" ON "RemarketingLead"("status", "nextRun");

-- CreateIndex
CREATE INDEX "RemarketingLead_userId_status_idx" ON "RemarketingLead"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RemarketingLead_userId_number_key" ON "RemarketingLead"("userId", "number");
