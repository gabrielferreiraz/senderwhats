-- Substitui o índice simples em whatsappMsgId por um índice único
-- Permite deduplicação de mensagens via Prisma upsert/createMany skipDuplicates
-- NULLs não conflitam entre si (comportamento padrão do PostgreSQL)

DROP INDEX IF EXISTS "WhatsAppChat_whatsappMsgId_idx";
CREATE UNIQUE INDEX "WhatsAppChat_whatsappMsgId_key" ON "WhatsAppChat"("whatsappMsgId");
