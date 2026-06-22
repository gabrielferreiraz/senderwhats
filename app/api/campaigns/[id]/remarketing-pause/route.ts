import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { paused } = await req.json() as { paused: boolean }

  if (typeof paused !== "boolean") {
    return NextResponse.json({ error: "Campo 'paused' obrigatório (boolean)" }, { status: 400 })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, enableRemarketing: true },
  })

  if (!campaign) {
    return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 })
  }

  if (!campaign.enableRemarketing) {
    return NextResponse.json({ error: "Campanha sem remarketing ativo" }, { status: 400 })
  }

  // Count overdue leads BEFORE updating so the worker can't race us to clear them
  let overdueCount = 0
  if (!paused) {
    overdueCount = await prisma.remarketingLead.count({
      where: { campaignId: id, status: "pending", replied: false, nextRun: { lt: new Date() } },
    })
  }

  await prisma.campaign.update({
    where: { id },
    data: { rmktPaused: paused },
  })

  return NextResponse.json({ ok: true, paused, overdueCount })
}
