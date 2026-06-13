import { prisma } from "@/lib/prisma"
import { ScriptsPageClient } from "@/components/scripts/ScriptsPageClient"

export const dynamic = "force-dynamic"

export default async function ScriptsPage() {
  const [templates, vendedores] = await Promise.all([
    prisma.messageTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { steps: true } } },
    }),
    prisma.vendedor.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, userId: true },
    }),
  ])

  const serializedTemplates = templates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }))

  return (
    <ScriptsPageClient
      templates={serializedTemplates}
      vendedores={vendedores}
    />
  )
}
