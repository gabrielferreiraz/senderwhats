import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"
import { normalizePhone } from "@/lib/phone"

export const dynamic = "force-dynamic"

type MsgForJourney = { status: string; replied: boolean; campaign: { vendedorId: string | null } }
type RmktForJourney = { currentStep: number; status: string; replied: boolean }
type RmktRow = RmktForJourney & { number: string }

function computeJourney(
  msgs: MsgForJourney[],
  rmkt: RmktForJourney | null,
  lastContactedAt: Date | null,
  vendedorId?: string
): string {
  const filtered = vendedorId ? msgs.filter((m) => m.campaign.vendedorId === vendedorId) : msgs

  if (rmkt?.replied || filtered.some((m) => m.replied)) return "respondeu"
  if (rmkt?.status === "pending") return `rmkt_${rmkt.currentStep}`
  if (rmkt?.status === "completed") return "rmkt_concluido"
  if (filtered.some((m) => m.status === "SENT" || m.status === "COMPLETED")) return "enviado"
  if (filtered.some((m) => m.status === "FAILED")) return "falhou"
  if (filtered.some((m) => m.status === "PENDING" || m.status === "SENDING")) return "aguardando"
  if (lastContactedAt) return "enviado"
  return "sem_envio"
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
    const limit = Math.min(100, parseInt(sp.get("limit") ?? "20"))
    const vendedorId = sp.get("vendedorId") ?? undefined
    const sortByRaw = sp.get("sortBy") ?? "createdAt"
    const sortDir   = sp.get("sortDir") === "asc" ? "asc" : "desc"
    const sortBy    = ["createdAt", "name", "phone"].includes(sortByRaw) ? sortByRaw : "createdAt"

    // Resolve vendedorUserId para escopo do rmkt no batch de leads abaixo
    let vendedorUserId: string | undefined
    if (vendedorId) {
      const v = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { userId: true } })
      vendedorUserId = v?.userId
    }

    const where = await buildContactWhere({
      search:        sp.get("search")?.trim()  ?? undefined,
      listId:        sp.get("listId")          ?? undefined,
      vendedorId,
      journey:       sp.get("journey")         ?? undefined,
      createdAfter:  sp.get("createdAfter")    ?? undefined,
      createdBefore: sp.get("createdBefore")   ?? undefined,
    })

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          phone: true,
          name: true,
          tags: true,
          variables: true,
          lastContactedAt: true,
          createdAt: true,
          _count: { select: { listItems: true } },
          listItems: { select: { list: { select: { id: true, name: true } } } },
          // take:50 — contacts rarely have >50 campaign messages; enough for journey calc
          messages: {
            select: { status: true, replied: true, campaign: { select: { vendedorId: true } } },
            take: 50,
          },
        },
      }),
      prisma.contact.count({ where }),
    ])

    // Batch-fetch rmkt leads for these contacts; fall back to [] on error
    const contactPhones = contacts.map((c) => c.phone)
    const rmktLeads: RmktRow[] =
      contactPhones.length > 0
        ? await prisma.remarketingLead
            .findMany({
              where: {
                number: { in: contactPhones },
                ...(vendedorUserId ? { userId: vendedorUserId } : {}),
              },
              select: { number: true, currentStep: true, status: true, replied: true },
              orderBy: { createdAt: "desc" },
            })
            .catch(() => [])
        : []

    // Keep only the most recently created lead per phone (most recent engagement)
    const rmktByPhone = new Map<string, RmktForJourney>()
    for (const r of rmktLeads) {
      if (!rmktByPhone.has(r.number)) rmktByPhone.set(r.number, r)
    }

    const contactsWithJourney = contacts.map(({ messages, lastContactedAt, ...c }) => ({
      ...c,
      journey: computeJourney(messages, rmktByPhone.get(c.phone) ?? null, lastContactedAt, vendedorId),
    }))

    return NextResponse.json({
      contacts: contactsWithJourney,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error("[GET /api/contacts]", err)
    return NextResponse.json({ error: "Erro interno ao buscar contatos" }, { status: 500 })
  }
}

// POST /api/contacts — adiciona um contato individual com detecção de duplicata
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { phone?: string; name?: string; listId?: string }
    const rawPhone = String(body.phone ?? "").trim()
    if (!rawPhone) return NextResponse.json({ error: "Telefone é obrigatório" }, { status: 400 })

    const phone = normalizePhone(rawPhone)
    if (phone.length < 12) return NextResponse.json({ error: "Número de telefone inválido" }, { status: 400 })

    // Verifica se já existe
    const existing = await prisma.contact.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        name: true,
        createdAt: true,
        lastContactedAt: true,
        listItems: {
          select: {
            list: {
              select: {
                id: true,
                name: true,
                vendedor: { select: { nome: true } },
              },
            },
          },
        },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 5,
          select: {
            status: true,
            sentAt: true,
            campaign: {
              select: {
                name: true,
                status: true,
                vendedor: { select: { nome: true } },
              },
            },
          },
        },
      },
    })

    if (existing) {
      return NextResponse.json({
        exists: true,
        contact: {
          ...existing,
          createdAt: existing.createdAt.toISOString(),
          lastContactedAt: existing.lastContactedAt?.toISOString() ?? null,
          messages: existing.messages.map((m) => ({
            ...m,
            sentAt: m.sentAt?.toISOString() ?? null,
          })),
        },
      }, { status: 409 })
    }

    // Cria o contato
    const contact = await prisma.contact.create({
      data: {
        phone,
        name: body.name?.trim() || null,
      },
    })

    // Adiciona à lista se informada
    if (body.listId) {
      const list = await prisma.contactList.findUnique({ where: { id: body.listId } })
      if (list) {
        await prisma.contactListItem.create({
          data: { contactId: contact.id, listId: body.listId },
        }).catch(() => {}) // ignora se já estiver na lista
      }
    }

    return NextResponse.json({ exists: false, contact: { ...contact, createdAt: contact.createdAt.toISOString() } }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/contacts]", err)
    return NextResponse.json({ error: "Erro interno ao criar contato" }, { status: 500 })
  }
}
