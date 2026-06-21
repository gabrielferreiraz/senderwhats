import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { assignTemplateIds, type AbTemplate } from "@/lib/ab-testing"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action, scheduledAt: scheduledAtRaw, target } = await req.json() as {
    action: "START" | "PAUSE" | "RESUME" | "SCHEDULE" | "FORCE_DISPATCH"
    scheduledAt?: string
    target?: "pending" | "all" | "sent_only"
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
    const now = new Date()

    if (target === "all") {
      await prisma.$transaction([
        prisma.campaign.update({ where: { id }, data: { status: newStatus } }),
        prisma.campaignMessage.updateMany({
          where: { campaignId: id },
          data: { status: "PENDING", nextSendAt: now, currentStep: 1, sentAt: null },
        }),
      ])
    } else if (target === "sent_only") {
      await prisma.$transaction([
        prisma.campaignMessage.updateMany({
          where: { campaignId: id, status: "PENDING" },
          data: { status: "SKIPPED" },
        }),
        prisma.campaignMessage.updateMany({
          where: { campaignId: id, status: { in: ["SENT", "COMPLETED"] } },
          data: { status: "PENDING", nextSendAt: now, currentStep: 1, sentAt: null },
        }),
        prisma.campaign.update({ where: { id }, data: { status: newStatus } }),
      ])
    } else {
      await prisma.campaign.update({ where: { id }, data: { status: newStatus } })
    }
    return NextResponse.json({ ok: true, status: newStatus })
  }

  if (action === "START") {
    const existing = await prisma.campaignMessage.count({ where: { campaignId: id } })

    if (existing > 0) {
      const now = new Date()
      if (target === "all") {
        // Reset every message back to PENDING — re-sends to everyone from step 1
        await prisma.$transaction([
          prisma.campaign.update({ where: { id }, data: { status: "RUNNING", scheduledAt: null } }),
          prisma.campaignMessage.updateMany({
            where: { campaignId: id },
            data: { status: "PENDING", nextSendAt: now, currentStep: 1, sentAt: null },
          }),
        ])
      } else if (target === "sent_only") {
        // Skip current pending queue, re-queue only already-sent messages
        await prisma.$transaction([
          prisma.campaignMessage.updateMany({
            where: { campaignId: id, status: "PENDING" },
            data: { status: "SKIPPED" },
          }),
          prisma.campaignMessage.updateMany({
            where: { campaignId: id, status: { in: ["SENT", "COMPLETED"] } },
            data: { status: "PENDING", nextSendAt: now, currentStep: 1, sentAt: null },
          }),
          prisma.campaign.update({ where: { id }, data: { status: "RUNNING", scheduledAt: null } }),
        ])
      } else {
        // Default: only process remaining PENDING (existing behavior)
        await prisma.$transaction([
          prisma.campaign.update({ where: { id }, data: { status: "RUNNING", scheduledAt: null } }),
          prisma.campaignMessage.updateMany({
            where: { campaignId: id, status: "PENDING", nextSendAt: { gt: now } },
            data: { nextSendAt: now },
          }),
        ])
      }
      return NextResponse.json({ ok: true, queued: existing })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: { listId: true, templateId: true, templates: true, vendedorId: true },
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

    // Deduplicação cross-campanha: quando target !== "all", pula contatos que já receberam
    // mensagem de qualquer campanha deste vendedor OU foram marcados manualmente
    let alreadyContactedIds = new Set<string>()
    if (target !== "all" && items.length > 0) {
      const contactIds = items.map(i => i.contactId)
      const [byHistory, byFlag] = await Promise.all([
        prisma.campaignMessage.findMany({
          where: {
            contactId: { in: contactIds },
            status: { in: ["SENT", "COMPLETED"] },
            campaign: { vendedorId: campaign.vendedorId },
          },
          select: { contactId: true },
          distinct: ["contactId"],
        }),
        prisma.contact.findMany({
          where: { id: { in: contactIds }, lastContactedAt: { not: null } },
          select: { id: true },
        }),
      ])
      alreadyContactedIds = new Set([
        ...byHistory.map(m => m.contactId),
        ...byFlag.map(c => c.id),
      ])
    }

    const assignments = assignTemplateIds(items.length, abTemplates)

    await prisma.$transaction([
      prisma.campaign.update({ where: { id }, data: { status: "RUNNING" } }),
      prisma.campaignMessage.createMany({
        data: items.map(({ contactId }, i) => ({
          campaignId: id,
          contactId,
          currentStep: 1,
          status: alreadyContactedIds.has(contactId) ? "SKIPPED" : "PENDING",
          nextSendAt: alreadyContactedIds.has(contactId) ? null : new Date(),
          templateId: assignments[i] ?? null,
        })),
        skipDuplicates: true,
      }),
    ])

    return NextResponse.json({
      ok: true,
      queued: items.length - alreadyContactedIds.size,
      skippedDuplicates: alreadyContactedIds.size,
    })
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
