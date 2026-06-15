import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { computeScheduleEstimate } from "@/lib/campaign-estimate"
import { parsePhones } from "@/lib/phone"
import { assignTemplateIds, type AbTemplate } from "@/lib/ab-testing"

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [campaign, statusCounts, queueMessages, sentMessages, failedMessages, nextPendingMsg] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id },
      include: {
        vendedor: { select: { nome: true, userId: true } },
        list: { select: { name: true, _count: { select: { items: true } } } },
        template: { select: { name: true, _count: { select: { steps: true } } } },
        scheduleRules: { orderBy: { dayOfWeek: "asc" } },
      },
    }),
    prisma.campaignMessage.groupBy({
      by: ["status"],
      where: { campaignId: id },
      _count: { _all: true },
    }),
    // Queue: contacts that haven't started yet
    prisma.campaignMessage.findMany({
      where: { campaignId: id, status: "PENDING" },
      orderBy: [{ nextSendAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 30,
      include: { contact: { select: { phone: true, name: true } } },
    }),
    // Sent: contacts that received at least one message (SENDING = mid-sequence, COMPLETED = done)
    prisma.campaignMessage.findMany({
      where: { campaignId: id, status: { in: ["SENDING", "SENT", "COMPLETED"] } },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }],
      take: 50,
      include: { contact: { select: { phone: true, name: true } } },
    }),
    // Failed: most recently failed, include failure reason
    prisma.campaignMessage.findMany({
      where: { campaignId: id, status: "FAILED" },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }],
      take: 100,
      include: { contact: { select: { phone: true, name: true } } },
    }),
    // Next message the worker is waiting on (has a future nextSendAt)
    prisma.campaignMessage.findFirst({
      where: {
        campaignId: id,
        status: { in: ["PENDING", "SENDING"] },
        nextSendAt: { gt: new Date() },
      },
      orderBy: { nextSendAt: "asc" },
      include: { contact: { select: { phone: true, name: true } } },
    }),
  ])

  if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  // Build counts map
  const counts: Record<string, number> = {}
  for (const row of statusCounts) {
    counts[row.status] = row._count._all
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const pending = counts["PENDING"] ?? 0

  const estimate = computeScheduleEstimate({
    scheduleRules: campaign.scheduleRules,
    minDelay: campaign.minDelay,
    maxDelay: campaign.maxDelay,
    maxSendsPerDay: campaign.maxSendsPerDay,
    pending,
  })

  // Real delivery/read counts from ack events
  const [deliveredCount, readCount] = await Promise.all([
    prisma.campaignMessage.count({
      where: { campaignId: id, ackStatus: { gte: 2 } },
    }),
    prisma.campaignMessage.count({
      where: { campaignId: id, ackStatus: { gte: 3 } },
    }),
  ])

  return NextResponse.json({
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    _counts: {
      total,
      pending,
      sending: counts["SENDING"] ?? 0,
      sent: counts["SENT"] ?? 0,
      failed: counts["FAILED"] ?? 0,
      completed: counts["COMPLETED"] ?? 0,
      delivered: deliveredCount,
      read: readCount,
    },
    estimate,
    queueMessages: queueMessages.map((m) => ({
      id: m.id,
      status: m.status,
      currentStep: m.currentStep,
      nextSendAt: m.nextSendAt?.toISOString() ?? null,
      contact: m.contact,
    })),
    sentMessages: sentMessages.map((m) => ({
      id: m.id,
      status: m.status,
      currentStep: m.currentStep,
      sentAt: m.sentAt?.toISOString() ?? null,
      nextSendAt: m.nextSendAt?.toISOString() ?? null,
      contact: m.contact,
    })),
    failedMessages: failedMessages.map((m) => ({
      id: m.id,
      currentStep: m.currentStep,
      sentAt: m.sentAt?.toISOString() ?? null,
      failureReason: m.failureReason,
      failureCategory: m.failureCategory,
      contact: m.contact,
    })),
    nextPending: nextPendingMsg
      ? {
          id: nextPendingMsg.id,
          nextSendAt: nextPendingMsg.nextSendAt?.toISOString() ?? null,
          contact: nextPendingMsg.contact,
        }
      : null,
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as {
    fullEdit?: boolean
    name?: string
    vendedorId?: string
    listId?: string | null
    manualNumbers?: string
    templates?: { id: string; weight: number }[]
    customMessage?: string
    minDelay?: number
    maxDelay?: number
    enableRemarketing?: boolean
    rmktScripts?: { templateId: string }[]
    rmktIntervalMinutes?: number
    rmktMaxFollowUps?: number
    rmktWindowStart?: string
    rmktWindowEnd?: string
    rmktAllowedDays?: string
    rmktMinDelaySec?: number
    rmktMaxDelaySec?: number
    rmktMaxPerDay?: number
    maxSendsPerDay?: number
    scheduleRules?: {
      dayOfWeek: number
      startTime: string
      endTime: string
      maxContacts: number | null
      maxContactsPeriod?: string
    }[]
  }

  // ── Full edit (from edit page, DRAFT campaigns only) ───────────────────────
  if (body.fullEdit) {
    const { name, vendedorId, listId, manualNumbers, templates, customMessage, minDelay, maxDelay, enableRemarketing, maxSendsPerDay, scheduleRules,
      rmktScripts, rmktIntervalMinutes, rmktMaxFollowUps, rmktWindowStart, rmktWindowEnd, rmktAllowedDays, rmktMinDelaySec, rmktMaxDelaySec, rmktMaxPerDay } = body

    if (!name?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
    if (!vendedorId)   return NextResponse.json({ error: "Vendedor é obrigatório" }, { status: 400 })
    if ((minDelay ?? 0) > (maxDelay ?? 0)) {
      return NextResponse.json({ error: "Delay mínimo não pode ser maior que o máximo" }, { status: 400 })
    }

    const campaign = await prisma.campaign.findUnique({ where: { id }, select: { status: true } })
    if (!campaign) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
    if (campaign.status !== "DRAFT") {
      return NextResponse.json({ error: "Só rascunhos podem ser editados" }, { status: 409 })
    }

    const numTemplates = templates?.length ?? 0
    const campaignTemplateId = numTemplates === 1 ? templates![0]!.id : null
    const campaignTemplatesJson = numTemplates > 1 ? (templates as object) : Prisma.JsonNull

    const manualPhones = manualNumbers?.trim() ? parsePhones(manualNumbers) : []
    const resolvedAbTemplates: AbTemplate[] = numTemplates > 1
      ? (templates as AbTemplate[])
      : numTemplates === 1
        ? [{ id: templates![0]!.id, weight: 100 }]
        : []

    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id },
        data: {
          name: name!.trim(),
          vendedorId: vendedorId!,
          listId: listId || null,
          templateId: campaignTemplateId,
          templates: campaignTemplatesJson,
          customMessage: customMessage?.trim() || null,
          minDelay: minDelay ?? 10,
          maxDelay: maxDelay ?? 30,
          ...(enableRemarketing    !== undefined && { enableRemarketing }),
          ...(maxSendsPerDay      !== undefined && { maxSendsPerDay }),
          ...(rmktScripts         !== undefined && { rmktScripts: rmktScripts as object }),
          ...(rmktIntervalMinutes !== undefined && { rmktIntervalMinutes }),
          ...(rmktMaxFollowUps    !== undefined && { rmktMaxFollowUps }),
          ...(rmktWindowStart     !== undefined && { rmktWindowStart }),
          ...(rmktWindowEnd       !== undefined && { rmktWindowEnd }),
          ...(rmktAllowedDays     !== undefined && { rmktAllowedDays }),
          ...(rmktMinDelaySec     !== undefined && { rmktMinDelaySec }),
          ...(rmktMaxDelaySec     !== undefined && { rmktMaxDelaySec }),
          ...(rmktMaxPerDay       !== undefined && { rmktMaxPerDay }),
        },
      })
      await tx.campaignScheduleRule.deleteMany({ where: { campaignId: id } })
      if (scheduleRules?.length) {
        await tx.campaignScheduleRule.createMany({
          data: scheduleRules.map((r) => ({
            campaignId: id,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            maxContacts: r.maxContacts ?? null,
            maxContactsPeriod: r.maxContactsPeriod,
          })),
        })
      }

      if (manualPhones.length > 0) {
        await tx.campaignMessage.deleteMany({ where: { campaignId: id, status: "PENDING" } })
        const contactIds: string[] = []
        for (const phone of manualPhones) {
          const contact = await tx.contact.upsert({
            where: { phone },
            create: { phone },
            update: {},
          })
          contactIds.push(contact.id)
        }
        const assignments = assignTemplateIds(contactIds.length, resolvedAbTemplates)
        await tx.campaignMessage.createMany({
          data: contactIds.map((contactId, i) => ({
            campaignId: id,
            contactId,
            currentStep: 1,
            status: "PENDING",
            nextSendAt: new Date(),
            templateId: assignments[i] ?? null,
          })),
          skipDuplicates: true,
        })
      }
    })

    return NextResponse.json({ ok: true })
  }

  // ── Inline edit (name / delays from CampaignDetail) ───────────────────────
  const { name, minDelay, maxDelay } = body

  if (minDelay !== undefined && maxDelay !== undefined && minDelay > maxDelay) {
    return NextResponse.json({ error: "Delay mínimo não pode ser maior que o máximo" }, { status: 400 })
  }

  await prisma.campaign.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(minDelay !== undefined && { minDelay }),
      ...(maxDelay !== undefined && { maxDelay }),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.campaign.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
}
