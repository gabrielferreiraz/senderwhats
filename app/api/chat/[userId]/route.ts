import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// GET /api/chat/[userId] — one row per conversation (most recent message per contactPhone)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const rows = await prisma.whatsAppChat.findMany({
    where: { userId },
    orderBy: { timestamp: "desc" },
    distinct: ["contactPhone"],
    take: 100,
    select: {
      contactPhone: true,
      contactName: true,
      direction: true,
      body: true,
      mediaType: true,
      ackStatus: true,
      timestamp: true,
    },
  })

  // Enrich with contact names from Contact table when contactName is missing
  const phones = rows.filter((r) => !r.contactName).map((r) => r.contactPhone)
  const contacts = phones.length > 0
    ? await prisma.contact.findMany({
        where: { phone: { in: phones } },
        select: { phone: true, name: true },
      })
    : []
  const nameByPhone = new Map(contacts.map((c) => [c.phone, c.name]))

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      contactName: r.contactName ?? nameByPhone.get(r.contactPhone) ?? null,
      timestamp: r.timestamp.toISOString(),
    }))
  )
}
