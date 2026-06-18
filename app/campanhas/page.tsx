import { prisma } from "@/lib/prisma"
import { CampaignsList } from "@/components/campanhas/CampaignsList"

export const dynamic = "force-dynamic"

export default async function CampanhasPage() {
  const [campaigns, messageCounts, rmktPendingCounts] = await Promise.all([
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
    prisma.remarketingLead.groupBy({
      by: ["campaignId"],
      where: { status: "pending", campaignId: { not: null } },
      _count: { _all: true },
    }),
  ])

  const statsMap = new Map<string, Record<string, number>>()
  for (const row of messageCounts) {
    if (!statsMap.has(row.campaignId)) statsMap.set(row.campaignId, {})
    statsMap.get(row.campaignId)![row.status] = row._count._all
  }

  const rmktMap = new Map<string, number>()
  for (const row of rmktPendingCounts) {
    if (row.campaignId) rmktMap.set(row.campaignId, row._count._all)
  }

  const serialized = campaigns.map((c) => {
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
        pendingRmkt: rmktMap.get(c.id) ?? 0,
      },
    }
  })

  return (
    <div className="max-w-7xl mx-auto">
      <CampaignsList initial={serialized} />
    </div>
  )
}
