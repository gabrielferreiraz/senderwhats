import { prisma } from "@/lib/prisma"
import { ScriptsList } from "@/components/scripts/ScriptsList"

export const dynamic = "force-dynamic"

export default async function ScriptsPage() {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { steps: true } } },
  })

  const serialized = templates.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <ScriptsList initial={serialized} />
    </div>
  )
}
