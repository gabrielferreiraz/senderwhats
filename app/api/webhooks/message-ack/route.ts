import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  // Same auth as /webhooks/whatsapp — Authorization: Bearer <WEBHOOK_SECRET>
  const secret = process.env.WEBHOOK_SECRET
  if (secret) {
    const auth = req.headers.get("authorization") ?? ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth
    // Also accept legacy x-webhook-secret header during transition
    const legacy = req.headers.get("x-webhook-secret") ?? ""
    if (token !== secret && legacy !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let body: { messageId?: string; ack?: number; userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { messageId, ack } = body
  if (!messageId || typeof ack !== "number") {
    return NextResponse.json({ error: "messageId and ack are required" }, { status: 400 })
  }

  // Only update if the new ack is higher than the current one (events can arrive out of order)
  await Promise.all([
    prisma.campaignMessage.updateMany({
      where: { whatsappMsgId: messageId, ackStatus: { lt: ack } },
      data: { ackStatus: ack },
    }),
    prisma.whatsAppChat.updateMany({
      where: { whatsappMsgId: messageId, ackStatus: { lt: ack } },
      data: { ackStatus: ack },
    }),
  ])

  return NextResponse.json({ ok: true })
}
