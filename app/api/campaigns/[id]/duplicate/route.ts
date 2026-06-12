import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const original = await prisma.campaign.findUnique({
    where: { id },
    include: { scheduleRules: true },
  })
  if (!original) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const copy = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        name: `${original.name} (cópia)`,
        vendedorId: original.vendedorId,
        listId: original.listId,
        templateId: original.templateId,
        templates: original.templates ?? undefined,
        customMessage: original.customMessage,
        minDelay: original.minDelay,
        maxDelay: original.maxDelay,
        status: "DRAFT",
        scheduledAt: null,
      },
    })

    if (original.scheduleRules.length > 0) {
      await tx.campaignScheduleRule.createMany({
        data: original.scheduleRules.map((r) => ({
          campaignId: c.id,
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
          maxContacts: r.maxContacts,
          maxContactsPeriod: r.maxContactsPeriod,
        })),
      })
    }

    return c
  })

  return NextResponse.json({ id: copy.id }, { status: 201 })
}
