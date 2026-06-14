import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function getRangeStart(range: string): Date {
  const d = new Date()
  if (range === "today") { d.setHours(0, 0, 0, 0); return d }
  if (range === "30d") { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d }
  d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d
}

function buildChartDays(range: string) {
  const n = range === "30d" ? 30 : range === "today" ? 1 : 7
  const days: { key: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().split("T")[0]!
    const label =
      n <= 7
        ? d.toLocaleDateString("pt-BR", { weekday: "short" })
        : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    days.push({ key, label })
  }
  return days
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vendedorId = searchParams.get("vendedorId") || undefined
  const range = searchParams.get("range") || "7d"

  const rangeStart = getRangeStart(range)
  const campaignFilter = vendedorId ? { vendedorId } : {}
  const msgFilter = vendedorId ? { campaign: { vendedorId } } : {}

  let rmktFilter: { userId?: string } = {}
  if (vendedorId) {
    const v = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { userId: true } })
    if (v) rmktFilter = { userId: v.userId }
  }

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
    prisma.campaignMessage.count({ where: { status: "SENT", sentAt: { gte: rangeStart }, ...msgFilter } }),
    prisma.campaignMessage.count({ where: { status: "FAILED", createdAt: { gte: rangeStart }, ...msgFilter } }),
    prisma.campaign.count({ where: { status: "RUNNING", ...campaignFilter } }),
    vendedorId
      ? prisma.contact.count({ where: { listItems: { some: { list: { vendedorId } } } } })
      : prisma.contact.count(),
    prisma.campaignMessage.findMany({
      where: {
        ...msgFilter,
        status: { in: ["SENT", "FAILED"] },
        OR: [{ sentAt: { gte: rangeStart } }, { createdAt: { gte: rangeStart } }],
      },
      select: { status: true, sentAt: true, createdAt: true },
    }),
    prisma.campaignMessage.count({
      where: { status: { in: ["SENT", "COMPLETED"] }, sentAt: { gte: rangeStart }, ...msgFilter },
    }),
    prisma.campaignMessage.count({ where: { status: { in: ["PENDING", "SENDING"] }, ...msgFilter } }),
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
    prisma.remarketingLead.count({ where: { createdAt: { gte: rangeStart }, ...rmktFilter } }),
    prisma.remarketingLead.count({ where: { replied: true, createdAt: { gte: rangeStart }, ...rmktFilter } }),
    prisma.remarketingLead.count({ where: { status: "pending", ...rmktFilter } }),
  ])

  // Chart data
  const chartDays = buildChartDays(range)
  const chartMap = new Map(chartDays.map((d) => [d.key, { day: d.label, enviadas: 0, falhas: 0 }]))
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

  return NextResponse.json({
    sentInRange,
    failedInRange,
    activeCampaigns,
    totalContacts,
    chartData,
    funnel: { enviadas: funnelSent, falhas: failedInRange, pendentes: funnelPending, taxaSucesso },
    vendorRanking,
    remarketing: { totalLeads: rmktTotal, replied: rmktReplied, pending: rmktPending, taxaResposta },
  })
}
