import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ScriptBuilderPage } from "@/components/scripts/ScriptBuilderPage"

export const dynamic = "force-dynamic"

export default async function EditScriptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const template = await prisma.messageTemplate.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  })

  if (!template) return notFound()

  const serialized = {
    id: template.id,
    name: template.name,
    steps: template.steps.map((s) => ({
      stepOrder: s.stepOrder,
      stepType: s.stepType,
      body: s.body,
      imageUrl: s.imageUrl ?? null,
      audioUrl: s.audioUrl ?? null,
      delayAfter: s.delayAfter,
    })),
  }

  return <ScriptBuilderPage template={serialized} />
}
