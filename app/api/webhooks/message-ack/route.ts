import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ""

export async function POST(req: NextRequest) {
  // Optional shared secret — if set, validate it
  if (WEBHOOK_SECRET) {
    const incoming = req.headers.get("x-webhook-secret") ?? ""
    if (incoming !== WEBHOOK_SECRET) {
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
  await prisma.campaignMessage.updateMany({
    where: {
      whatsappMsgId: messageId,
      ackStatus: { lt: ack },
    },
    data: { ackStatus: ack },
  })

  return NextResponse.json({ ok: true })
}
