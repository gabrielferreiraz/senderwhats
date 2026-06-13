import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assignTemplateIds, type AbTemplate } from "@/lib/ab-testing"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action, scheduledAt: scheduledAtRaw } = await req.json() as {
    action: "START" | "PAUSE" | "RESUME" | "SCHEDULE" | "FORCE_DISPATCH"
    scheduledAt?: string
  }

  if (action === "FORCE_DISPATCH") {
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { status: true, forceDispatch: true } })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    if (campaign.status !== "RUNNING")
      return NextResponse.json({ error: "Só campanhas em execução podem ser forçadas" }, { status: 409 })
    const newValue = !campaign.forceDispatch
    await prisma.campaign.update({ where: { id }, data: { forceDispatch: newValue } })
    return NextResponse.json({ ok: true, forceDispatch: newValue })
  }

  if (action === "PAUSE") {
    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { status: true } })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    if (campaign.status !== "RUNNING" && campaign.status !== "SCHEDULED")
      return NextResponse.json({ error: "Só campanhas em execução ou agendadas podem ser pausadas" }, { status: 409 })
    // Sempre limpa forceDispatch ao pausar — retomada volta a respeitar a janela
    await prisma.campaign.update({ where: { id }, data: { status: "PAUSED", forceDispatch: false } })
    return NextResponse.json({ ok: true })
  }

  if (action === "RESUME") {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { status: true, scheduledAt: true },
    })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    if (campaign.status !== "PAUSED")
      return NextResponse.json({ error: "Só campanhas pausadas podem ser retomadas" }, { status: 409 })

    const newStatus =
      campaign.scheduledAt && campaign.scheduledAt > new Date() ? "SCHEDULED" : "RUNNING"
    await prisma.campaign.update({ where: { id }, data: { status: newStatus } })
    return NextResponse.json({ ok: true, status: newStatus })
  }

  if (action === "START") {
    const existing = await prisma.campaignMessage.count({ where: { campaignId: id } })

    if (existing > 0) {
      // Campaign was SCHEDULED: messages have nextSendAt = scheduled time.
      // Reset any future nextSendAt so the worker picks them up immediately.
      const now = new Date()
      await prisma.$transaction([
        prisma.campaign.update({ where: { id }, data: { status: "RUNNING", scheduledAt: null } }),
        prisma.campaignMessage.updateMany({
          where: { campaignId: id, status: "PENDING", nextSendAt: { gt: now } },
          data: { nextSendAt: now },
        }),
      ])
      return NextResponse.json({ ok: true, queued: existing })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { listId: true, templateId: true, templates: true },
    })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

    if (!campaign.listId) {
      await prisma.campaign.update({ where: { id }, data: { status: "RUNNING" } })
      return NextResponse.json({ ok: true, queued: 0 })
    }

    // Resolve effective A/B templates for this campaign
    const abTemplates: AbTemplate[] = (() => {
      if (Array.isArray(campaign.templates) && campaign.templates.length > 0) {
        return campaign.templates as AbTemplate[]
      }
      if (campaign.templateId) return [{ id: campaign.templateId, weight: 100 }]
      return []
    })()

    if (abTemplates.length > 1) {
      const weightSum = abTemplates.reduce((s, t) => s + t.weight, 0)
      if (weightSum !== 100) {
        return NextResponse.json(
          { error: `A soma dos pesos dos scripts A/B deve ser 100% (soma atual: ${weightSum}%). Edite a campanha e corrija os pesos.` },
          { status: 400 }
        )
      }
    }

    const items = await prisma.contactListItem.findMany({
      where: { listId: campaign.listId },
      select: { contactId: true },
    })

    const assignments = assignTemplateIds(items.length, abTemplates)

    await prisma.$transaction([
      prisma.campaign.update({ where: { id }, data: { status: "RUNNING" } }),
      prisma.campaignMessage.createMany({
        data: items.map(({ contactId }, i) => ({
          campaignId: id,
          contactId,
          currentStep: 1,
          status: "PENDING",
          nextSendAt: new Date(),
          templateId: assignments[i] ?? null,
        })),
        skipDuplicates: true,
      }),
    ])

    return NextResponse.json({ ok: true, queued: items.length })
  }

  if (action === "SCHEDULE") {
    const scheduled = scheduledAtRaw ? new Date(scheduledAtRaw) : null
    if (!scheduled || isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      return NextResponse.json({ error: "Data de agendamento deve ser uma data futura válida" }, { status: 400 })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { status: true, listId: true, templateId: true, templates: true },
    })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    if (!["DRAFT", "PAUSED"].includes(campaign.status)) {
      return NextResponse.json({ error: "Só rascunhos e campanhas pausadas podem ser agendados" }, { status: 409 })
    }

    const existing = await prisma.campaignMessage.count({ where: { campaignId: id } })

    if (existing > 0) {
      await prisma.$transaction([
        prisma.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: scheduled } }),
        prisma.campaignMessage.updateMany({
          where: { campaignId: id, status: "PENDING" },
          data: { nextSendAt: scheduled },
        }),
      ])
    } else if (campaign.listId) {
      const abTemplates: AbTemplate[] = (() => {
        if (Array.isArray(campaign.templates) && campaign.templates.length > 0) {
          return campaign.templates as AbTemplate[]
        }
        if (campaign.templateId) return [{ id: campaign.templateId, weight: 100 }]
        return []
      })()

      if (abTemplates.length > 1) {
        const weightSum = abTemplates.reduce((s, t) => s + t.weight, 0)
        if (weightSum !== 100) {
          return NextResponse.json(
            { error: `A soma dos pesos dos scripts A/B deve ser 100% (soma atual: ${weightSum}%). Edite a campanha e corrija os pesos.` },
            { status: 400 }
          )
        }
      }

      const items = await prisma.contactListItem.findMany({
        where: { listId: campaign.listId },
        select: { contactId: true },
      })
      const assignments = assignTemplateIds(items.length, abTemplates)

      await prisma.$transaction([
        prisma.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: scheduled } }),
        prisma.campaignMessage.createMany({
          data: items.map(({ contactId }, i) => ({
            campaignId: id,
            contactId,
            currentStep: 1,
            status: "PENDING",
            nextSendAt: scheduled,
            templateId: assignments[i] ?? null,
          })),
          skipDuplicates: true,
        }),
      ])
    } else {
      await prisma.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: scheduled } })
    }

    return NextResponse.json({ ok: true, status: "SCHEDULED" })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}
