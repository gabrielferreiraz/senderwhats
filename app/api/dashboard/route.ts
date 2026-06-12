import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vendedorId = searchParams.get("vendedorId") || undefined

  const campaignFilter = vendedorId ? { vendedorId } : {}
  const msgFilter = vendedorId ? { campaign: { vendedorId } } : {}

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const [
    sentToday,
    failedToday,
    activeCampaigns,
    totalContacts,
    recentMessages,
    totalSent,
    totalFailed,
    totalPending,
    allCampaigns,
    allVendedores,
  ] = await Promise.all([
    prisma.campaignMessage.count({ where: { status: "SENT", sentAt: { gte: today }, ...msgFilter } }),
    prisma.campaignMessage.count({ where: { status: "FAILED", createdAt: { gte: today }, ...msgFilter } }),
    prisma.campaign.count({ where: { status: "RUNNING", ...campaignFilter } }),
    prisma.contact.count(),
    prisma.campaignMessage.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, ...msgFilter },
      select: { status: true, sentAt: true, createdAt: true },
    }),
    prisma.campaignMessage.count({ where: { status: { in: ["SENT", "COMPLETED"] }, ...msgFilter } }),
    prisma.campaignMessage.count({ where: { status: "FAILED", ...msgFilter } }),
    prisma.campaignMessage.count({ where: { status: { in: ["PENDING", "SENDING"] }, ...msgFilter } }),
    // For vendor ranking: message counts grouped by campaign
    prisma.campaignMessage.groupBy({
      by: ["campaignId", "status"],
      where: { status: { in: ["SENT", "COMPLETED", "FAILED"] } },
      _count: { _all: true },
    }),
    prisma.vendedor.findMany({
      select: {
        id: true,
        nome: true,
        userId: true,
        campanhas: { select: { id: true } },
      },
    }),
  ])

  // ── Chart data ──────────────────────────────────────────────────────────────
  const dayLabels: Record<string, string> = {}
  const chartMap: Record<string, { enviadas: number; falhas: number }> = {}

  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().split("T")[0] as string
    dayLabels[key] = d.toLocaleDateString("pt-BR", { weekday: "short" })
    chartMap[key] = { enviadas: 0, falhas: 0 }
  }

  for (const msg of recentMessages) {
    const date = msg.sentAt ?? msg.createdAt
    const key = date.toISOString().split("T")[0] as string
    if (!chartMap[key]) continue
    if (msg.status === "SENT") chartMap[key]!.enviadas++
    if (msg.status === "FAILED") chartMap[key]!.falhas++
  }

  const chartData = Object.entries(chartMap).map(([key, counts]) => ({
    day: dayLabels[key] ?? key,
    ...counts,
  }))

  // ── Vendor ranking ──────────────────────────────────────────────────────────
  const campaignToVendor = new Map<string, string>()
  for (const v of allVendedores) {
    for (const c of v.campanhas) {
      campaignToVendor.set(c.id, v.id)
    }
  }

  const vendorStats = new Map<string, { nome: string; userId: string; sent: number; failed: number }>()
  for (const v of allVendedores) {
    vendorStats.set(v.id, { nome: v.nome, userId: v.userId, sent: 0, failed: 0 })
  }

  for (const { campaignId, status, _count } of allCampaigns) {
    const vid = campaignToVendor.get(campaignId)
    if (!vid) continue
    const vs = vendorStats.get(vid)
    if (!vs) continue
    if (status === "SENT" || status === "COMPLETED") vs.sent += _count._all
    if (status === "FAILED") vs.failed += _count._all
  }

  const vendorRanking = [...vendorStats.entries()]
    .map(([id, data]) => ({
      id,
      ...data,
      taxaSucesso:
        data.sent + data.failed > 0
          ? Math.round((data.sent / (data.sent + data.failed)) * 100)
          : 0,
    }))
    .filter((v) => v.sent + v.failed > 0)
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 8)

  const taxaSucesso = totalSent + totalFailed > 0
    ? Math.round((totalSent / (totalSent + totalFailed)) * 100)
    : 0

  return NextResponse.json({
    sentToday,
    failedToday,
    activeCampaigns,
    totalContacts,
    chartData,
    funnel: { enviadas: totalSent, falhas: totalFailed, pendentes: totalPending, taxaSucesso },
    vendorRanking,
  })
}
