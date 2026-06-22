-- Index for remarketing worker query: WHERE enableRemarketing = true AND rmktPaused = false
CREATE INDEX "Campaign_enableRemarketing_rmktPaused_idx" ON "Campaign"("enableRemarketing", "rmktPaused");
