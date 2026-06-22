import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { CampaignDetail } from "@/components/campanhas/CampaignDetail"
import { computeScheduleEstimate } from "@/lib/campaign-estimate"

export const dynamic = "force-dynamic"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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
    // Failed: most recently failed
    prisma.campaignMessage.findMany({
      where: { campaignId: id, status: "FAILED" },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }],
      take: 100,
      include: { contact: { select: { phone: true, name: true } } },
    }),
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

  if (!campaign) return notFound()

  const counts: Record<string, number> = {}
  for (const row of statusCounts) counts[row.status] = row._count._all
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const pending = counts["PENDING"] ?? 0

  const [deliveredCount, readCount, repliedCount, repliedViaRemarketingCount] = await Promise.all([
    prisma.campaignMessage.count({ where: { campaignId: id, ackStatus: { gte: 2 } } }),
    prisma.campaignMessage.count({ where: { campaignId: id, ackStatus: { gte: 3 } } }),
    prisma.campaignMessage.count({ where: { campaignId: id, replied: true } }),
    prisma.campaignMessage.count({ where: { campaignId: id, repliedViaRemarketing: true } }),
  ])

  const estimate = computeScheduleEstimate({
    scheduleRules: campaign.scheduleRules,
    minDelay: campaign.minDelay,
    maxDelay: campaign.maxDelay,
    maxSendsPerDay: campaign.maxSendsPerDay,
    pending,
  })

  const serialized = {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status as
      | "DRAFT"
      | "SCHEDULED"
      | "RUNNING"
      | "PAUSED"
      | "COMPLETED"
      | "FAILED",
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    minDelay: campaign.minDelay,
    maxDelay: campaign.maxDelay,
    maxSendsPerDay: campaign.maxSendsPerDay,
    forceDispatch: campaign.forceDispatch,
    enableRemarketing: campaign.enableRemarketing,
    rmktScripts: (campaign.rmktScripts ?? []) as { templateId: string }[],
    rmktIntervalMinutes: campaign.rmktIntervalMinutes,
    rmktWindowStart: campaign.rmktWindowStart,
    rmktWindowEnd: campaign.rmktWindowEnd,
    rmktAllowedDays: campaign.rmktAllowedDays,
    rmktMaxPerDay: campaign.rmktMaxPerDay,
    rmktPaused: campaign.rmktPaused,
    scheduleRules: campaign.scheduleRules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      maxContacts: r.maxContacts,
      maxContactsPeriod: r.maxContactsPeriod,
    })),
    vendedor: campaign.vendedor,
    list: campaign.list
      ? { name: campaign.list.name, _count: { items: campaign.list._count.items } }
      : null,
    template: campaign.template
      ? { name: campaign.template.name, _count: { steps: campaign.template._count.steps } }
      : null,
    _counts: {
      total,
      pending,
      sending: counts["SENDING"] ?? 0,
      sent: counts["SENT"] ?? 0,
      failed: counts["FAILED"] ?? 0,
      completed: counts["COMPLETED"] ?? 0,
      delivered: deliveredCount,
      read: readCount,
      replied: repliedCount,
      repliedViaRemarketing: repliedViaRemarketingCount,
    },
    estimate,
    queueMessages: queueMessages.map((m) => ({
      id: m.id,
      status: "PENDING" as const,
      currentStep: m.currentStep,
      nextSendAt: m.nextSendAt?.toISOString() ?? null,
      contact: m.contact,
    })),
    sentMessages: sentMessages.map((m) => ({
      id: m.id,
      status: m.status as "SENDING" | "SENT" | "COMPLETED",
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
  }

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignDetail initial={serialized} />
    </div>
  )
}
