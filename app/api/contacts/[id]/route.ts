import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.$transaction(async (tx) => {
      // CampaignMessage has no onDelete: Cascade from Contact, so delete explicitly
      await tx.campaignMessage.deleteMany({ where: { contactId: id } })
      // Contact deletion cascades ContactListItem via onDelete: Cascade
      await tx.contact.delete({ where: { id } })
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  }
}
