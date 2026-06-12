import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const lists = await prisma.contactList.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } },
      vendedor: { select: { nome: true, userId: true } },
    },
  })
  return NextResponse.json(lists)
}

export async function POST(req: NextRequest) {
  const { name, description, vendedorId } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  }
  const list = await prisma.contactList.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      vendedorId: vendedorId || null,
    },
  })
  return NextResponse.json(list)
}
