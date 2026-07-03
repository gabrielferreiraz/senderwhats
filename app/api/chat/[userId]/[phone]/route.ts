import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { whatsapp } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

// GET /api/chat/[userId]/[phone] — full conversation history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; phone: string }> }
) {
  const { userId, phone } = await params
  const before = req.nextUrl.searchParams.get("before") // ISO string for pagination

  const messages = await prisma.whatsAppChat.findMany({
    where: {
      userId,
      contactPhone: phone,
      ...(before ? { timestamp: { lt: new Date(before) } } : {}),
    },
    orderBy: { timestamp: "asc" },
    take: 150,
    select: {
      id: true,
      direction: true,
      body: true,
      mediaType: true,
      whatsappMsgId: true,
      ackStatus: true,
      timestamp: true,
    },
  })

  // Resolve contact name
  const contact = await prisma.contact.findFirst({
    where: { phone },
    select: { name: true },
  })

  return NextResponse.json({
    contactName: contact?.name ?? null,
    messages: messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() })),
  })
}

// POST /api/chat/[userId]/[phone] — send a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string; phone: string }> }
) {
  const { userId, phone } = await params
  const { message } = await req.json() as { message: string }

  if (!message?.trim()) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })
  }

  const result = await whatsapp.sendText(userId, phone, message.trim())

  const saved = await prisma.whatsAppChat.create({
    data: {
      userId,
      contactPhone: phone,
      contactName: null,
      direction: "out",
      body: message.trim(),
      mediaType: "text",
      whatsappMsgId: result.whatsappMessageId ?? null,
      ackStatus: 1,
      timestamp: new Date(),
    },
    select: {
      id: true,
      direction: true,
      body: true,
      mediaType: true,
      whatsappMsgId: true,
      ackStatus: true,
      timestamp: true,
    },
  })

  return NextResponse.json({ ...saved, timestamp: saved.timestamp.toISOString() })
}
