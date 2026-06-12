import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

  return NextResponse.json({
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    _counts: {
      total,
      pending: counts["PENDING"] ?? 0,
      sending: counts["SENDING"] ?? 0,
      sent: counts["SENT"] ?? 0,
      failed: counts["FAILED"] ?? 0,
      completed: counts["COMPLETED"] ?? 0,
    },
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
  const { name, minDelay, maxDelay } = await req.json()

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
