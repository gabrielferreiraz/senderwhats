import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    contactIds?: string[]
    filter?: { search?: string; listId?: string; vendedorId?: string; journey?: string }
  }

  let result: { count: number }

  if (body.filter) {
    const where = await buildContactWhere(body.filter)
    result = await prisma.contact.updateMany({ where, data: { lastContactedAt: null } })
  } else {
    const { contactIds } = body
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: "Nenhum contato selecionado" }, { status: 400 })
    }
    result = await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: { lastContactedAt: null },
    })
  }

  return NextResponse.json({ ok: true, updated: result.count })
}
