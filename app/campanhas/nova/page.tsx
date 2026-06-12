import { prisma } from "@/lib/prisma"
import { CampaignForm } from "@/components/campanhas/CampaignForm"

export const dynamic = "force-dynamic"

export default async function NovaCampanhaPage() {
  const [vendedores, lists, templates] = await Promise.all([
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

  return <CampaignForm vendedores={vendedores} lists={lists} templates={templates} />
}
