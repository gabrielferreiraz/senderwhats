import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const template = await prisma.messageTemplate.findUnique({
    where: { id },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  })
  if (!template) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return NextResponse.json(template)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name, steps } = await req.json() as {
    name: string
    steps: { body: string; delayAfter: number; stepType?: string; imageUrl?: string | null; audioUrl?: string | null }[]
  }

  await prisma.$transaction(async (tx) => {
    await tx.messageTemplate.update({ where: { id }, data: { name: name.trim() } })
    await tx.templateStep.deleteMany({ where: { templateId: id } })
    if (steps?.length) {
      await tx.templateStep.createMany({
        data: steps.map((s, i) => {
          const type = s.stepType === "image" ? "image" : s.stepType === "audio" ? "audio" : "text"
          return {
            templateId: id,
            stepOrder: i + 1,
            stepType: type,
            body: type === "audio" ? "" : (s.body ?? ""),
            imageUrl: type === "image" ? (s.imageUrl ?? null) : null,
            audioUrl: type === "audio" ? (s.audioUrl ?? null) : null,
            delayAfter: Math.max(0, Math.floor(Number(s.delayAfter) || 0)),
          }
        }),
      })
    }
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.messageTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  }
}
