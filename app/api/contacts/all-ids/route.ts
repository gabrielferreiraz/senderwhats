import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Returns every contact ID matching the current filter — used for "select all pages" bulk actions
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const listId = sp.get("listId") ?? undefined
  const vendedorId = sp.get("vendedorId") ?? undefined
  const journey = sp.get("journey") ?? undefined
  const search = sp.get("search")?.trim() ?? ""

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    })
  }

  if (listId) conditions.push({ listItems: { some: { listId } } })

  const msgVendorFilter = vendedorId ? { campaign: { vendedorId } } : {}

  switch (journey) {
    case "sem_envio":
      conditions.push({
        AND: [
          { messages: { none: vendedorId ? { campaign: { vendedorId } } : {} } },
          { lastContactedAt: null },
        ],
      })
      break
    case "aguardando":
      conditions.push({ messages: { some: { status: { in: ["PENDING", "SENDING"] }, ...msgVendorFilter } } })
      break
    case "enviado":
      conditions.push({
        OR: [
          { messages: { some: { status: { in: ["SENT", "COMPLETED"] }, ...msgVendorFilter } } },
          { lastContactedAt: { not: null } },
        ],
      })
      break
    case "falhou":
      conditions.push({ messages: { some: { status: "FAILED", ...msgVendorFilter } } })
      break
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any =
    conditions.length === 0 ? {} :
    conditions.length === 1 ? conditions[0] :
    { AND: conditions }

  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true },
  })

  return NextResponse.json({ ids: contacts.map((c) => c.id) })
}
