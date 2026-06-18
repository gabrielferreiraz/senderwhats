import { NextRequest, NextResponse } from "next/server"
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
    [key: string]: unknown
  }

  console.log("[webhook/whatsapp] 📨 Evento recebido:", JSON.stringify({
    userId: body.userId,
    instanceId: body.instanceId,
    from: body.from,
    body: body.body?.slice(0, 80),
    timestamp: body.timestamp,
    extraKeys: Object.keys(body).filter(k => !["userId","instanceId","from","body","timestamp"].includes(k)),
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
    select: { id: true, phone: true },
  })

  console.log("[webhook/whatsapp] 👤 Contato:", contact ? `encontrado (${contact.phone})` : "não encontrado")

  const tasks: Promise<unknown>[] = []

  if (contact && vendedor) {
    const result = await prisma.campaignMessage.updateMany({
      where: {
        contactId: contact.id,
        replied: false,
        campaign: { vendedorId: vendedor.id },
        status: { in: ["PENDING", "SENDING", "SENT", "COMPLETED"] },
      },
      data: { replied: true, repliedAt: now },
    })
    console.log("[webhook/whatsapp] 📨 CampaignMessages marcados como replied:", result.count)
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

  if (tasks.length > 0) await Promise.all(tasks)

  const response = {
    ok: true,
    vendedor: vendedor?.userId ?? null,
    contact: !!contact,
    lead: rmktResult.count > 0,
  }
  console.log("[webhook/whatsapp] ✅ Processado:", response)
  return NextResponse.json(response)
}
