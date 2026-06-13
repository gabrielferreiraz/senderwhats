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

// POST /api/webhooks/whatsapp
// Called by the WhatsApp API every time an instance receives an individual message.
// Payload: { userId, instanceId, from, body, timestamp }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId?: string
      instanceId?: string
      from?: string
      body?: string
      timestamp?: number
    }

    const instanceUserId = body.userId ?? body.instanceId
    const from = body.from?.replace("@c.us", "")

    if (!instanceUserId || !from) {
      return NextResponse.json({ error: "userId e from são obrigatórios" }, { status: 400 })
    }

    const normalizedFrom = normalizePhone(from)
    const now = new Date()

    // Run both lookups in parallel
    const [contact, rmktLead] = await Promise.all([
      prisma.contact.findFirst({ where: { phone: normalizedFrom }, select: { id: true } }),
      prisma.remarketingLead.findFirst({
        where: { userId: instanceUserId, number: normalizedFrom, status: "pending", replied: false },
        select: { id: true },
      }),
    ])

    const tasks: Promise<unknown>[] = []

    // Mark CampaignMessages as replied for this contact
    if (contact) {
      // Find the vendedor to scope campaign messages
      const vendedor = await prisma.vendedor.findFirst({
        where: { userId: instanceUserId },
        select: { id: true },
      })
      if (vendedor) {
        tasks.push(
          prisma.campaignMessage.updateMany({
            where: {
              contactId: contact.id,
              replied: false,
              campaign: { vendedorId: vendedor.id },
              status: { in: ["SENT", "COMPLETED"] },
            },
            data: { replied: true, repliedAt: now },
          })
        )
      }
    }

    // Mark remarketing lead as replied + completed (stop follow-ups)
    if (rmktLead) {
      tasks.push(
        prisma.remarketingLead.update({
          where: { id: rmktLead.id },
          data: { replied: true, repliedAt: now, status: "completed" },
        })
      )
    }

    if (tasks.length > 0) await Promise.all(tasks)

    return NextResponse.json({ ok: true, contact: !!contact, lead: !!rmktLead })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[webhook/whatsapp]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
