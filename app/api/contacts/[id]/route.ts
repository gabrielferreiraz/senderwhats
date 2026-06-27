import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      listItems: { include: { list: { select: { id: true, name: true } } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          campaign: { select: { id: true, name: true } },
          template:  { select: { name: true } },
        },
      },
    },
  })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  return NextResponse.json({
    ...contact,
    createdAt:       contact.createdAt.toISOString(),
    lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
    messages: contact.messages.map((m) => ({
      id:            m.id,
      status:        m.status,
      currentStep:   m.currentStep,
      sentAt:        m.sentAt?.toISOString()     ?? null,
      nextSendAt:    m.nextSendAt?.toISOString() ?? null,
      failureReason: m.failureReason,
      campaign:      m.campaign,
      template:      m.template,
    })),
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as { name?: string }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Nome inválido" }, { status: 400 })
  }
  const contact = await prisma.contact.update({
    where: { id },
    data: { name: body.name.trim() },
    select: { id: true, name: true },
  })
  return NextResponse.json(contact)
}

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
