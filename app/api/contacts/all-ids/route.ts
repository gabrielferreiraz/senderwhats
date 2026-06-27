import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"

const ID_CAP = 5_000

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const filter = {
    listId:        sp.get("listId")         ?? undefined,
    vendedorId:    sp.get("vendedorId")     ?? undefined,
    journey:       sp.get("journey")        ?? undefined,
    search:        sp.get("search")?.trim() ?? undefined,
    createdAfter:  sp.get("createdAfter")   ?? undefined,
    createdBefore: sp.get("createdBefore")  ?? undefined,
  }

  const where = await buildContactWhere(filter)

  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true },
    take: ID_CAP,
  })

  return NextResponse.json({
    ids: contacts.map((c) => c.id),
    capped: contacts.length === ID_CAP,
  })
}
