import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parsePhones } from "@/lib/phone"
import { assignTemplateIds, type AbTemplate } from "@/lib/ab-testing"

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const [campaigns, messageCounts] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        vendedor: { select: { nome: true, userId: true } },
        list: { select: { name: true } },
        template: { select: { name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.campaignMessage.groupBy({
      by: ["campaignId", "status"],
      _count: { _all: true },
    }),
  ])

  const statsMap = new Map<string, Record<string, number>>()
  for (const row of messageCounts) {
    if (!statsMap.has(row.campaignId)) statsMap.set(row.campaignId, {})
    statsMap.get(row.campaignId)![row.status] = row._count._all
  }

  const result = campaigns.map((c) => {
    const stats = statsMap.get(c.id) ?? {}
    return {
      ...c,
      createdAt: c.createdAt.toISOString(),
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      _stats: {
        sent: (stats["SENT"] ?? 0) + (stats["COMPLETED"] ?? 0),
        pending: stats["PENDING"] ?? 0,
        failed: stats["FAILED"] ?? 0,
        total: c._count.messages,
      },
    }
  })

  return NextResponse.json(result)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string
    vendedorId: string
    listId?: string
    manualNumbers?: string
    // A/B: multiple templates with weights. Single entry = simple mode.
    templates?: AbTemplate[]
    // Backward-compat: single templateId without weight
    templateId?: string
    customMessage?: string
    scheduledAt?: string
    minDelay: number
    maxDelay: number
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
    autoStart?: boolean
    scheduleRules?: {
      dayOfWeek: number
      startTime: string
      endTime: string
      maxContacts: number | null
      maxContactsPeriod?: string
    }[]
  }

  const {
    name, vendedorId, listId, manualNumbers,
    customMessage, scheduledAt,
    minDelay, maxDelay, enableRemarketing, maxSendsPerDay,
    rmktScripts, rmktIntervalMinutes, rmktMaxFollowUps,
    rmktWindowStart, rmktWindowEnd, rmktAllowedDays,
    rmktMinDelaySec, rmktMaxDelaySec, rmktMaxPerDay,
    autoStart, scheduleRules,
  } = body

  const rmktData = {
    ...(enableRemarketing !== undefined && { enableRemarketing }),
    ...(rmktScripts        !== undefined && { rmktScripts: rmktScripts as object }),
    ...(rmktIntervalMinutes !== undefined && { rmktIntervalMinutes }),
    ...(rmktMaxFollowUps   !== undefined && { rmktMaxFollowUps }),
    ...(rmktWindowStart    !== undefined && { rmktWindowStart }),
    ...(rmktWindowEnd      !== undefined && { rmktWindowEnd }),
    ...(rmktAllowedDays    !== undefined && { rmktAllowedDays }),
    ...(rmktMinDelaySec    !== undefined && { rmktMinDelaySec }),
    ...(rmktMaxDelaySec    !== undefined && { rmktMaxDelaySec }),
    ...(rmktMaxPerDay      !== undefined && { rmktMaxPerDay }),
  }

  if (!name?.trim() || !vendedorId) {
    return NextResponse.json({ error: "Nome e vendedor são obrigatórios" }, { status: 400 })
  }
  if ((minDelay ?? 10) > (maxDelay ?? 30)) {
    return NextResponse.json({ error: "Delay mínimo não pode ser maior que o máximo" }, { status: 400 })
  }

  // Resolve effective A/B templates from body
  const abTemplates: AbTemplate[] =
    body.templates?.length
      ? body.templates
      : body.templateId
        ? [{ id: body.templateId, weight: 100 }]
        : []

  // Validate A/B weights
  if (abTemplates.length > 1) {
    const weightSum = abTemplates.reduce((s, t) => s + t.weight, 0)
    if (weightSum !== 100) {
      return NextResponse.json(
        { error: `A soma dos pesos dos scripts A/B deve ser exatamente 100% (soma atual: ${weightSum}%).` },
        { status: 400 }
      )
    }
  }

  // How to store on the Campaign row:
  // - 1 template  → store templateId (simple mode, no JSON overhead)
  // - 2+ templates → store templates JSON, templateId = null
  const campaignTemplateId = abTemplates.length === 1 ? (abTemplates[0]!.id) : null
  const campaignTemplatesJson = abTemplates.length > 1 ? (abTemplates as object) : undefined

  // Determine status and whether to populate the queue immediately
  let status: "DRAFT" | "SCHEDULED" | "RUNNING" = "DRAFT"
  let scheduledDate: Date | null = null

  if (scheduledAt) {
    scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return NextResponse.json({ error: "scheduledAt deve ser uma data futura válida" }, { status: 400 })
    }
    status = "SCHEDULED"
  } else if (autoStart) {
    status = "RUNNING"
  }

  const shouldPopulate = status === "RUNNING" || status === "SCHEDULED"

  // ── Mode: manual numbers ──────────────────────────────────────────────────
  if (manualNumbers) {
    const phones = parsePhones(manualNumbers)
    if (phones.length === 0) {
      return NextResponse.json({ error: "Nenhum número válido encontrado." }, { status: 400 })
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          name: name.trim(),
          vendedorId,
          listId: null,
          templateId: campaignTemplateId,
          templates: campaignTemplatesJson,
          customMessage: customMessage?.trim() || null,
          scheduledAt: scheduledDate,
          minDelay: minDelay ?? 10,
          maxDelay: maxDelay ?? 30,
          maxSendsPerDay: maxSendsPerDay ?? 0,
          status,
          ...rmktData,
        },
      })

      if (scheduleRules?.length) {
        await tx.campaignScheduleRule.createMany({
          data: scheduleRules.map((r) => ({ campaignId: c.id, ...r })),
        })
      }

      if (shouldPopulate) {
        const contactIds: string[] = []
        for (const phone of phones) {
          const contact = await tx.contact.upsert({
            where: { phone },
            create: { phone },
            update: {},
          })
          contactIds.push(contact.id)
        }
        const nextSendAt = scheduledDate ?? new Date()
        const assignments = assignTemplateIds(contactIds.length, abTemplates)
        await tx.campaignMessage.createMany({
          data: contactIds.map((contactId, i) => ({
            campaignId: c.id,
            contactId,
            currentStep: 1,
            status: "PENDING",
            nextSendAt,
            templateId: assignments[i] ?? null,
          })),
          skipDuplicates: true,
        })
      }

      return c
    })

    return NextResponse.json({ ...campaign, scheduledAt: campaign.scheduledAt?.toISOString() ?? null }, { status: 201 })
  }

  // ── Mode: contact list ────────────────────────────────────────────────────
  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        name: name.trim(),
        vendedorId,
        listId: listId || null,
        templateId: campaignTemplateId,
        templates: campaignTemplatesJson,
        customMessage: customMessage?.trim() || null,
        scheduledAt: scheduledDate,
        minDelay: minDelay ?? 10,
        maxDelay: maxDelay ?? 30,
        status,
        ...rmktData,
      },
    })

    if (scheduleRules?.length) {
      await tx.campaignScheduleRule.createMany({
        data: scheduleRules.map((r) => ({ campaignId: c.id, ...r })),
      })
    }

    if (shouldPopulate && listId) {
      const items = await tx.contactListItem.findMany({
        where: { listId },
        select: { contactId: true },
      })
      if (items.length > 0) {
        const nextSendAt = scheduledDate ?? new Date()
        const assignments = assignTemplateIds(items.length, abTemplates)
        await tx.campaignMessage.createMany({
          data: items.map(({ contactId }, i) => ({
            campaignId: c.id,
            contactId,
            currentStep: 1,
            status: "PENDING",
            nextSendAt,
            templateId: assignments[i] ?? null,
          })),
          skipDuplicates: true,
        })
      }
    }

    return c
  })

  return NextResponse.json({ ...campaign, scheduledAt: campaign.scheduledAt?.toISOString() ?? null }, { status: 201 })
}
