import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { CampaignForm } from "@/components/campanhas/CampaignForm"
import type { ScheduleRule } from "@/components/campanhas/ScheduleRuleBuilder"

export const dynamic = "force-dynamic"

export default async function EditarCampanhaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [campaign, vendedores, lists, templates] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id },
      include: { scheduleRules: { orderBy: { dayOfWeek: "asc" } } },
    }),
    prisma.vendedor.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, userId: true },
    }),
    prisma.contactList.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, _count: { select: { items: true } } },
    }),
    prisma.messageTemplate.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, _count: { select: { steps: true } } },
    }),
  ])

  if (!campaign) return notFound()
  if (campaign.status !== "DRAFT") redirect(`/campanhas/${id}`)

  // Group flat DB rows (one per dayOfWeek) back into ScheduleRule objects (days[])
  const ruleMap = new Map<string, ScheduleRule>()
  for (const r of campaign.scheduleRules) {
    const key = `${r.startTime}|${r.endTime}|${r.maxContacts}|${r.maxContactsPeriod}`
    if (!ruleMap.has(key)) {
      ruleMap.set(key, {
        id: key,
        days: [],
        startTime: r.startTime,
        endTime: r.endTime,
        maxContacts: r.maxContacts,
        maxContactsPeriod: (r.maxContactsPeriod ?? "day") as "hour" | "day" | "week",
      })
    }
    ruleMap.get(key)!.days.push(r.dayOfWeek)
  }

  const initialData = {
    name: campaign.name,
    vendedorId: campaign.vendedorId,
    listId: campaign.listId,
    templateId: campaign.templateId,
    templates: campaign.templates as { id: string; weight: number }[] | null,
    customMessage: campaign.customMessage,
    minDelay: campaign.minDelay,
    maxDelay: campaign.maxDelay,
    enableRemarketing: campaign.enableRemarketing,
    rmktScripts: (campaign.rmktScripts ?? []) as { templateId: string }[],
    rmktIntervalMinutes: campaign.rmktIntervalMinutes,
    rmktWindowStart: campaign.rmktWindowStart,
    rmktWindowEnd: campaign.rmktWindowEnd,
    rmktAllowedDays: campaign.rmktAllowedDays,
    rmktMinDelaySec: campaign.rmktMinDelaySec,
    rmktMaxDelaySec: campaign.rmktMaxDelaySec,
    rmktMaxPerDay: campaign.rmktMaxPerDay,
    maxSendsPerDay: campaign.maxSendsPerDay,
    scheduleRules: Array.from(ruleMap.values()),
  }

  return (
    <CampaignForm
      vendedores={vendedores}
      lists={lists}
      templates={templates}
      campaignId={id}
      initialData={initialData}
    />
  )
}
