import { prisma } from "@/lib/prisma"
import { DashboardClient } from "@/components/dashboard/DashboardClient"

export const dynamic = "force-dynamic"

async function getInitialData() {
  const rangeStart = new Date()
  rangeStart.setDate(rangeStart.getDate() - 6)
  rangeStart.setHours(0, 0, 0, 0)

  const [
    sentInRange,
    failedInRange,
    activeCampaigns,
    totalContacts,
    chartMessages,
    funnelSent,
    funnelPending,
    msgGroups,
    allVendedores,
    rmktTotal,
    rmktReplied,
    rmktPending,
  ] = await Promise.all([
    prisma.campaignMessage.count({ where: { status: "SENT", sentAt: { gte: rangeStart } } }),
    prisma.campaignMessage.count({ where: { status: "FAILED", createdAt: { gte: rangeStart } } }),
    prisma.campaign.count({ where: { status: "RUNNING" } }),
    prisma.contact.count(),
    prisma.campaignMessage.findMany({
      where: {
        status: { in: ["SENT", "FAILED"] },
        OR: [{ sentAt: { gte: rangeStart } }, { createdAt: { gte: rangeStart } }],
      },
      select: { status: true, sentAt: true, createdAt: true },
    }),
    prisma.campaignMessage.count({ where: { status: { in: ["SENT", "COMPLETED"] }, sentAt: { gte: rangeStart } } }),
    prisma.campaignMessage.count({ where: { status: { in: ["PENDING", "SENDING"] } } }),
    prisma.campaignMessage.groupBy({
      by: ["campaignId", "status"],
      where: {
        status: { in: ["SENT", "COMPLETED", "FAILED"] },
        OR: [{ sentAt: { gte: rangeStart } }, { createdAt: { gte: rangeStart } }],
      },
      _count: { _all: true },
    }),
    prisma.vendedor.findMany({
      select: { id: true, nome: true, userId: true, campanhas: { select: { id: true } } },
    }),
    prisma.remarketingLead.count({ where: { createdAt: { gte: rangeStart } } }),
    prisma.remarketingLead.count({ where: { replied: true, createdAt: { gte: rangeStart } } }),
    prisma.remarketingLead.count({ where: { status: "pending" } }),
  ])

  // Chart data (7 days)
  const chartMap = new Map<string, { day: string; enviadas: number; falhas: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().split("T")[0]!
    chartMap.set(key, { day: d.toLocaleDateString("pt-BR", { weekday: "short" }), enviadas: 0, falhas: 0 })
  }
  for (const msg of chartMessages) {
    const key = (msg.sentAt ?? msg.createdAt).toISOString().split("T")[0]!
    const entry = chartMap.get(key)
    if (!entry) continue
    if (msg.status === "SENT") entry.enviadas++
    if (msg.status === "FAILED") entry.falhas++
  }
  const chartData = [...chartMap.values()]

  // Vendor ranking
  const campaignToVendor = new Map<string, string>()
  for (const v of allVendedores) {
    for (const c of v.campanhas) campaignToVendor.set(c.id, v.id)
  }
  const vendorStats = new Map<string, { nome: string; userId: string; sent: number; failed: number }>()
  for (const v of allVendedores) vendorStats.set(v.id, { nome: v.nome, userId: v.userId, sent: 0, failed: 0 })
  for (const { campaignId, status, _count } of msgGroups) {
    const vid = campaignToVendor.get(campaignId)
    const vs = vid ? vendorStats.get(vid) : undefined
    if (!vs) continue
    if (status === "SENT" || status === "COMPLETED") vs.sent += _count._all
    if (status === "FAILED") vs.failed += _count._all
  }
  const vendorRanking = [...vendorStats.entries()]
    .map(([id, data]) => ({
      id,
      ...data,
      taxaSucesso: data.sent + data.failed > 0 ? Math.round((data.sent / (data.sent + data.failed)) * 100) : 0,
    }))
    .filter((v) => v.sent + v.failed > 0)
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 8)

  const taxaSucesso =
    funnelSent + failedInRange > 0 ? Math.round((funnelSent / (funnelSent + failedInRange)) * 100) : 0
  const taxaResposta = rmktTotal > 0 ? Math.round((rmktReplied / rmktTotal) * 100) : 0

  return {
    initial: {
      sentInRange,
      failedInRange,
      activeCampaigns,
      totalContacts,
      chartData,
      funnel: { enviadas: funnelSent, falhas: failedInRange, pendentes: funnelPending, taxaSucesso },
      vendorRanking,
      remarketing: { totalLeads: rmktTotal, replied: rmktReplied, pending: rmktPending, taxaResposta },
    },
    vendedores: allVendedores.map(({ id, nome, userId }) => ({ id, nome, userId })),
  }
}

export default async function DashboardPage() {
  const { initial, vendedores } = await getInitialData()
  return <DashboardClient initial={initial} vendedores={vendedores} />
}
