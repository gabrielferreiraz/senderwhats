CREATE TABLE "WhatsAppChat" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactName" TEXT,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL DEFAULT 'text',
  "whatsappMsgId" TEXT,
  "ackStatus" INTEGER NOT NULL DEFAULT 0,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppChat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppChat_userId_contactPhone_timestamp_idx" ON "WhatsAppChat"("userId", "contactPhone", "timestamp");
CREATE INDEX "WhatsAppChat_userId_timestamp_idx" ON "WhatsAppChat"("userId", "timestamp");
CREATE INDEX "WhatsAppChat_whatsappMsgId_idx" ON "WhatsAppChat"("whatsappMsgId");
