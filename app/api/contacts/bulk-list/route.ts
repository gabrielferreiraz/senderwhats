import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"
import type { ContactFilter } from "@/lib/contacts/buildContactWhere"

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    listId: string
    action: "add" | "remove"
    contactIds?: string[]
    filter?: ContactFilter
  }

  if (!body.listId || !["add", "remove"].includes(body.action)) {
    return NextResponse.json({ error: "listId e action (add|remove) são obrigatórios" }, { status: 400 })
  }

  const list = await prisma.contactList.findUnique({ where: { id: body.listId } })
  if (!list) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })

  // Resolve IDs — either explicit list or server-side filter
  let ids: string[]
  if (body.filter) {
    const where = await buildContactWhere(body.filter)
    ids = await prisma.contact.findMany({ where, select: { id: true } }).then((r) => r.map((c) => c.id))
  } else {
    if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
      return NextResponse.json({ error: "Nenhum contato selecionado" }, { status: 400 })
    }
    ids = body.contactIds
  }

  if (ids.length === 0) return NextResponse.json({ ok: true, affected: 0 })

  if (body.action === "add") {
    await prisma.contactListItem.createMany({
      data: ids.map((contactId) => ({ contactId, listId: body.listId })),
      skipDuplicates: true,
    })
  } else {
    await prisma.contactListItem.deleteMany({
      where: { listId: body.listId, contactId: { in: ids } },
    })
  }

  return NextResponse.json({ ok: true, affected: ids.length })
}
