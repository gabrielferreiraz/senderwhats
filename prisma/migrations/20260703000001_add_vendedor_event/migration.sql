-- CreateTable
CREATE TABLE "VendedorEvent" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "event"     TEXT NOT NULL,
    "reason"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendedorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendedorEvent_userId_createdAt_idx" ON "VendedorEvent"("userId", "createdAt");
