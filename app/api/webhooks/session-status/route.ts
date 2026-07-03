import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { CampaignStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // ── Auth (igual ao webhook de mensagens) ──────────────────────────────────
  const secret = process.env.WEBHOOK_SECRET
  if (secret) {
    const auth  = req.headers.get("authorization") ?? ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth
    if (token !== secret) {
      console.warn("[session-status] ❌ Unauthorized — token inválido")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let body: {
    event:          "disconnected" | "reconnecting"
    userId:         string
    instanceId:     string
    reason:         string
    retryInSeconds?: number
    timestamp:      number
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { event, userId, instanceId, reason, retryInSeconds } = body

  if (!event || !userId) {
    return NextResponse.json({ error: "event e userId são obrigatórios" }, { status: 400 })
  }

  console.log(`[session-status] ${event} — userId: ${userId} — instanceId: ${instanceId} — ${reason}`)

  if (event === "disconnected") {
    const paused = await prisma.campaign.updateMany({
      where: {
        vendedor: { userId },
        status:   { in: ["RUNNING", "SCHEDULED"] as CampaignStatus[] },
      },
      data: { status: "PAUSED" },
    })

    if (paused.count > 0) {
      console.log(`[session-status] ⏸️  ${paused.count} campanha(s) pausada(s) para ${userId}`)
    }
  } else if (event === "reconnecting") {
    console.log(`[session-status] 🔄 Reconectando ${userId} em ${retryInSeconds ?? "?"}s`)
  }

  // Salva histórico do evento
  await prisma.vendedorEvent.create({
    data: {
      userId,
      event,
      reason: reason ?? null,
    },
  })

  return NextResponse.json({ ok: true, event, userId })
}
