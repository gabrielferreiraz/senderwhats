import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// DELETE /api/remarketing/leads/:id?userId=xxx — Parar lead manualmente
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = req.nextUrl.searchParams.get("userId")

  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
  }

  try {
    const lead = await prisma.remarketingLead.findFirst({ where: { id, userId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
    }

    await prisma.remarketingLead.update({
      where: { id },
      data: { status: "stop_by_admin" },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao parar lead" }, { status: 500 })
  }
}
