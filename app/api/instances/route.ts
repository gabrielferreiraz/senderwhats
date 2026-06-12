import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { whatsapp } from "@/lib/whatsapp"

export async function GET() {
  const vendedores = await prisma.vendedor.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campanhas: true, listas: true } } },
  })
  return NextResponse.json(vendedores)
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { nome?: string; userId?: string }
  const nome = body.nome?.trim() ?? ""
  const userId = body.userId?.trim().toLowerCase() ?? ""

  if (!nome || !userId) {
    return NextResponse.json({ error: "Nome e userId são obrigatórios." }, { status: 400 })
  }
  if (!/^[a-z0-9_]{2,30}$/.test(userId)) {
    return NextResponse.json(
      { error: "userId: use apenas letras minúsculas, números e _ (2–30 chars)." },
      { status: 400 }
    )
  }

  const existing = await prisma.vendedor.findUnique({ where: { userId } })
  if (existing) {
    return NextResponse.json({ error: "Este userId já está em uso." }, { status: 409 })
  }

  // Cria sessão na API WhatsApp (erros não bloqueiam — a sessão pode já existir)
  try {
    await whatsapp.createInstance(userId)
  } catch {
    // Pode retornar 400 se já existe — normal em reconexão
  }

  const vendedor = await prisma.vendedor.create({ data: { nome, userId } })
  return NextResponse.json(vendedor, { status: 201 })
}
