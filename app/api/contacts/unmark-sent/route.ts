import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const { contactIds } = await req.json() as { contactIds?: string[] }

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "Nenhum contato selecionado" }, { status: 400 })
  }

  const result = await prisma.contact.updateMany({
    where: { id: { in: contactIds } },
    data: { lastContactedAt: null },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
