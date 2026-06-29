import { NextRequest, NextResponse } from "next/server"
import { MessageStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function normalizePhone(raw: string): string {
  let clean = raw.replace(/\D/g, "")
  clean = clean.replace(/^0+/, "")
  if (clean.length < 8) return clean
  if (clean.startsWith("55") && clean.length >= 12) clean = clean.slice(2)
  if (clean.length === 8 || clean.length === 9) {
    if (clean.length === 8 && ["6", "7", "8", "9"].includes(clean[0] ?? "")) clean = "9" + clean
    clean = "11" + clean
  }
  if (clean.length === 10) {
    const ddd = clean.slice(0, 2)
    const local = clean.slice(2)
    if (["6", "7", "8", "9"].includes(local[0] ?? "")) clean = ddd + "9" + local
  }
  return "55" + clean
}

/** Mapeia o type do WhatsApp para o mediaType interno do chat */
function resolveMediaType(type?: string, hasMedia?: boolean): string {
  if (!type || type === "chat") return "text"
  if (type === "image" || type === "sticker") return "image"
  if (type === "ptt" || type === "audio") return "audio"
  if (type === "video") return "video"
  if (type === "document") return "document"
  if (hasMedia) return "media"
  return "text"
}

/** Variações do mesmo número (com e sem o 9º dígito) para matching mais robusto */
function phoneVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized])
  // Se tem 13 dígitos (55 + DDD + 9 + 8): tenta sem o 9
  if (normalized.length === 13) {
    const withoutNine = normalized.slice(0, 4) + normalized.slice(5)
    variants.add(withoutNine)
  }
  // Se tem 12 dígitos (55 + DDD + 8): tenta com o 9
  if (normalized.length === 12) {
    const withNine = normalized.slice(0, 4) + "9" + normalized.slice(4)
    variants.add(withNine)
  }
  return [...variants]
}

export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") ?? ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth
    if (token !== secret) {
      console.warn("[webhook/whatsapp] ❌ Unauthorized — token inválido")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    console.error("[webhook/whatsapp] ❌ Body inválido (não é JSON)")
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const body = rawBody as {
    userId?: string
    instanceId?: string
    from?: string
    body?: string
    timestamp?: number
    type?: string       // "chat" | "image" | "ptt" | "audio" | "video" | "document" | "sticker"
    hasMedia?: boolean
    messageId?: string  // Baileys key.id — used for deduplication when syncFullHistory is enabled
    [key: string]: unknown
  }

  const KNOWN_KEYS = new Set(["userId","instanceId","from","body","timestamp","type","hasMedia","messageId"])
  console.log("[webhook/whatsapp] 📨 Evento recebido:", JSON.stringify({
    userId: body.userId,
    instanceId: body.instanceId,
    from: body.from,
    body: body.body?.slice(0, 80),
    type: body.type,
    hasMedia: body.hasMedia,
    messageId: body.messageId,
    extraKeys: Object.keys(body).filter(k => !KNOWN_KEYS.has(k)),
  }))

  const rawInstanceId = body.userId ?? body.instanceId
  const rawFrom = body.from ?? ""

  // Ignorar mensagens de grupo (@g.us) e notificações do sistema
  if (rawFrom.includes("@g.us")) {
    return NextResponse.json({ ok: true, skipped: "group_message" })
  }
  if (body.type === "notification_template" || String(body.body ?? "").startsWith("[notification_template]")) {
    return NextResponse.json({ ok: true, skipped: "notification_template" })
  }

  const from = rawFrom.replace(/@[a-z.]+$/i, "") // remove @c.us, @lid, @s.whatsapp.net, etc.

  if (!rawInstanceId || !from) {
    console.warn("[webhook/whatsapp] ⚠️ Payload incompleto — userId/instanceId ou from ausente")
    return NextResponse.json({ error: "userId e from são obrigatórios" }, { status: 400 })
  }

  const normalizedFrom = normalizePhone(from)
  const variants = phoneVariants(normalizedFrom)
  const now = new Date()

  console.log("[webhook/whatsapp] 📱 from bruto:", from, "→ normalizado:", normalizedFrom, "variantes:", variants)

  // Resolve o vendedor a partir do userId ou instanceId da API
  // A API pode enviar o userId human-readable ("reobote_central_2") ou o instanceId (UUID)
  const vendedor = await prisma.vendedor.findFirst({
    where: { userId: rawInstanceId },
    select: { id: true, userId: true },
  })

  if (!vendedor) {
    console.warn("[webhook/whatsapp] ⚠️ Vendedor não encontrado para instanceId:", rawInstanceId)
  } else {
    console.log("[webhook/whatsapp] ✅ Vendedor encontrado:", vendedor.userId)
  }

  // Busca o contato pelas variantes do número
  const contact = await prisma.contact.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, phone: true, name: true },
  })

  console.log("[webhook/whatsapp] 👤 Contato:", contact ? `encontrado (${contact.phone})` : "não encontrado")

  // Descobre quais campanhas têm remarketing pendente para esse número ANTES de marcá-las
  // Isso permite atribuir corretamente: quem respondeu ao follow-up vs à mensagem original
  const pendingRmktLeads = vendedor
    ? await prisma.remarketingLead.findMany({
        where: {
          number: { in: variants },
          status: "pending",
          replied: false,
          userId: vendedor.userId,
        },
        select: { campaignId: true },
      })
    : []

  const rmktCampaignIds = pendingRmktLeads
    .map((l) => l.campaignId)
    .filter((id): id is string => id !== null)

  if (contact && vendedor) {
    const baseWhere = {
      contactId: contact.id,
      replied: false,
      campaign: { vendedorId: vendedor.id },
      status: { in: ["PENDING", "SENDING", "SENT", "COMPLETED"] as MessageStatus[] },
    }

    let total = 0
    if (rmktCampaignIds.length > 0) {
      // Respondeu ao follow-up: campanha com remarketing pendente
      const r1 = await prisma.campaignMessage.updateMany({
        where: { ...baseWhere, campaignId: { in: rmktCampaignIds } },
        data: { replied: true, repliedAt: now, repliedViaRemarketing: true },
      })
      // Respondeu diretamente: demais campanhas ativas desse vendedor
      const r2 = await prisma.campaignMessage.updateMany({
        where: { ...baseWhere, campaignId: { notIn: rmktCampaignIds } },
        data: { replied: true, repliedAt: now },
      })
      total = r1.count + r2.count
    } else {
      const r = await prisma.campaignMessage.updateMany({
        where: baseWhere,
        data: { replied: true, repliedAt: now },
      })
      total = r.count
    }
    console.log(
      "[webhook/whatsapp] 📨 CampaignMessages marcados como replied:",
      total,
      rmktCampaignIds.length > 0 ? `(${rmktCampaignIds.length} via remarketing)` : "(direto)"
    )
  }

  // Marca TODOS os leads de remarketing pendentes desse número como respondidos
  const rmktResult = await prisma.remarketingLead.updateMany({
    where: {
      number: { in: variants },
      status: "pending",
      replied: false,
      ...(vendedor ? { userId: vendedor.userId } : {}),
    },
    data: { replied: true, repliedAt: now, status: "completed" },
  })
  if (rmktResult.count > 0) {
    console.log("[webhook/whatsapp] 🛑 RemarketingLeads marcados como replied + completed:", rmktResult.count)
  }

  // Persist incoming message to chat history (fire-and-forget)
  // whatsappMsgId stored when API sends messageId — enables deduplication for syncFullHistory
  prisma.whatsAppChat.create({
    data: {
      userId: vendedor?.userId ?? rawInstanceId,
      contactPhone: normalizedFrom,
      contactName: contact?.name ?? null,
      direction: "in",
      body: String(body.body ?? ""),
      mediaType: resolveMediaType(body.type, body.hasMedia),
      whatsappMsgId: body.messageId ?? null,
      ackStatus: 0,
      timestamp: body.timestamp ? new Date(body.timestamp * 1000) : now,
    },
  }).catch((e) => console.error("[webhook/whatsapp] ⚠️ Erro ao salvar chat:", e))

  const response = {
    ok: true,
    vendedor: vendedor?.userId ?? null,
    contact: !!contact,
    lead: rmktResult.count > 0,
  }
  console.log("[webhook/whatsapp] ✅ Processado:", response)
  return NextResponse.json(response)
}
