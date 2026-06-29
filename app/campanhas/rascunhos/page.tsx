import { prisma } from "@/lib/prisma"
import { CampanhasNav } from "@/components/campanhas/CampanhasNav"
import { DraftsList } from "@/components/campanhas/DraftsList"

export const dynamic = "force-dynamic"

export default async function RascunhosPage() {
  const [drafts, draftCount] = await Promise.all([
    prisma.campaign.findMany({
      where: { status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        vendedor: { select: { nome: true } },
        list: { select: { name: true, _count: { select: { items: true } } } },
        template: { select: { name: true } },
      },
    }),
    prisma.campaign.count({ where: { status: "DRAFT" } }),
  ])

  const serialized = drafts.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <CampanhasNav draftCount={draftCount} />
      <DraftsList initial={serialized} />
    </div>
  )
}
