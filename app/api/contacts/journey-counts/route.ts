import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"
import type { ContactFilter } from "@/lib/contacts/buildContactWhere"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const base: ContactFilter = {
    search:        sp.get("search")?.trim() ?? undefined,
    listId:        sp.get("listId")         ?? undefined,
    vendedorId:    sp.get("vendedorId")     ?? undefined,
    createdAfter:  sp.get("createdAfter")   ?? undefined,
    createdBefore: sp.get("createdBefore")  ?? undefined,
    // journey omitido — contamos todos os grupos
  }

  const journeys = ["sem_envio", "aguardando", "enviado", "falhou", "respondeu", "rmkt", "rmkt_concluido"] as const

  const counts = await Promise.all(
    journeys.map(async (journey) => {
      const where = await buildContactWhere({ ...base, journey })
      const count = await prisma.contact.count({ where })
      return [journey, count] as const
    })
  )

  return NextResponse.json(Object.fromEntries(counts))
}
