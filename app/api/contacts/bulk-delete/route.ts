import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"
import type { ContactFilter } from "@/lib/contacts/buildContactWhere"

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    contactIds?: string[]
    filter?: ContactFilter
  }

  let deleted = 0

  if (body.filter) {
    const where = await buildContactWhere(body.filter)
    // Cascade manual: CampaignMessage não tem onDelete Cascade em Contact
    await prisma.$transaction(async (tx) => {
      const ids = await tx.contact.findMany({ where, select: { id: true } }).then((r) => r.map((c) => c.id))
      if (ids.length === 0) return
      await tx.campaignMessage.deleteMany({ where: { contactId: { in: ids } } })
      const result = await tx.contact.deleteMany({ where: { id: { in: ids } } })
      deleted = result.count
    })
  } else {
    const { contactIds } = body
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: "Nenhum contato selecionado" }, { status: 400 })
    }
    await prisma.$transaction(async (tx) => {
      await tx.campaignMessage.deleteMany({ where: { contactId: { in: contactIds } } })
      const result = await tx.contact.deleteMany({ where: { id: { in: contactIds } } })
      deleted = result.count
    })
  }

  return NextResponse.json({ ok: true, deleted })
}
