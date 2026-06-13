import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// POST /api/remarketing/leads — Adicionar lead ao funil de remarketing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      userId: string
      number: string
      name?: string
      intervalMinutes?: number
    }

    if (!body.userId?.trim() || !body.number?.trim()) {
      return NextResponse.json({ error: "userId e number são obrigatórios" }, { status: 400 })
    }

    // Config must exist and be enabled for the lead to ever be processed.
    const config = await prisma.remarketingConfig.findUnique({
      where: { userId: body.userId },
    })

    if (!config) {
      return NextResponse.json(
        { error: "Nenhuma configuração de remarketing encontrada para este userId. Crie a configuração primeiro." },
        { status: 422 }
      )
    }

    const intervalMinutes = body.intervalMinutes ?? config.intervalMinutes
    // Fire on the NEXT tick (now + interval) so the first follow-up respects the configured delay.
    const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000)

    const lead = await prisma.remarketingLead.upsert({
      where: { userId_number: { userId: body.userId, number: body.number } },
      update: {
        name: body.name,
        currentStep: 1,
        status: "pending",
        failCount: 0,
        triggeredAt: new Date(),
        nextRun,
      },
      create: {
        userId: body.userId,
        number: body.number,
        name: body.name,
        nextRun,
      },
    })

    return NextResponse.json(lead, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/remarketing/leads?userId=xxx — Listar leads de um usuário
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")
  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
  }

  const leads = await prisma.remarketingLead.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  return NextResponse.json(leads)
}
