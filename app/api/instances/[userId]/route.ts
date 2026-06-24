import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { whatsapp } from "@/lib/whatsapp"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const vendedor = await prisma.vendedor.findUnique({ where: { userId } })
  if (!vendedor) {
    return NextResponse.json({ error: "Vendedor não encontrado." }, { status: 404 })
  }

  // Remove sessão da memória, do banco whatsapp_sessions e dos arquivos temp
  try {
    await whatsapp.deleteInstance(userId)
  } catch {
    // Ignora se a sessão já não existia na API
  }

  // vendedorId em Campaign é SET NULL — campanhas ficam intactas, só perdem o vínculo
  await prisma.vendedor.delete({ where: { userId } })
  return NextResponse.json({ ok: true })
}
