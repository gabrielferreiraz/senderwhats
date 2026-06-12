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

  // Desconecta da API WhatsApp (best-effort)
  try {
    await whatsapp.disconnect(userId)
  } catch {
    // Ignora se já estava desconectado
  }

  await prisma.vendedor.delete({ where: { userId } })
  return NextResponse.json({ ok: true })
}
