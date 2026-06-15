import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { steps: true } } },
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const { name, steps } = await req.json() as {
    name: string
    steps: { body: string; delayAfter: number; stepType?: string; imageUrl?: string | null; audioUrl?: string | null }[]
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }

  const template = await prisma.$transaction(async (tx) => {
    const t = await tx.messageTemplate.create({ data: { name: name.trim() } })
    if (steps?.length) {
      await tx.templateStep.createMany({
        data: steps.map((s, i) => {
          const type = s.stepType === "image" ? "image" : s.stepType === "audio" ? "audio" : "text"
          return {
            templateId: t.id,
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
    return t
  })

  return NextResponse.json(template, { status: 201 })
}
