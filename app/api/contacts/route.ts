import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type MsgForJourney = { status: string; replied: boolean; campaign: { vendedorId: string } }
type RmktForJourney = { currentStep: number; status: string; replied: boolean }
type RmktRow = RmktForJourney & { number: string }

function computeJourney(
  msgs: MsgForJourney[],
  rmkt: RmktForJourney | null,
  lastContactedAt: Date | null,
  vendedorId?: string
): string {
  const filtered = vendedorId ? msgs.filter((m) => m.campaign.vendedorId === vendedorId) : msgs

  // Replied always wins regardless of source (campaign or rmkt)
  if (rmkt?.replied || filtered.some((m) => m.replied)) return "respondeu"

  // Active rmkt sequence (failed/stop_by_admin fall through to campaign stages below)
  if (rmkt?.status === "pending") return `rmkt_${rmkt.currentStep}`
  if (rmkt?.status === "completed") return "rmkt_concluido"

  // Campaign message stages
  if (filtered.some((m) => m.status === "SENT" || m.status === "COMPLETED")) return "enviado"
  if (filtered.some((m) => m.status === "FAILED")) return "falhou"
  if (filtered.some((m) => m.status === "PENDING" || m.status === "SENDING")) return "aguardando"

  // Manually marked as already sent (e.g. after data loss)
  if (lastContactedAt) return "enviado"

  return "sem_envio"
}

// Max phones to pre-load for rmkt-based journey filters
const RMKT_PHONE_LIMIT = 1000

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get("page") ?? "1"))
    const limit = Math.min(100, parseInt(sp.get("limit") ?? "20"))
    const search = sp.get("search")?.trim() ?? ""
    const listId = sp.get("listId") ?? undefined
    const vendedorId = sp.get("vendedorId") ?? undefined
    const journey = sp.get("journey") ?? undefined

    // Resolve WhatsApp userId for remarketing scope — silent if not found
    let vendedorUserId: string | undefined
    if (vendedorId) {
      const v = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { userId: true } })
      vendedorUserId = v?.userId
    }

    const msgVendorFilter = vendedorId ? { campaign: { vendedorId } } : {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = []

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      })
    }

    if (listId) conditions.push({ listItems: { some: { listId } } })

    // Journey-specific WHERE clauses
    switch (journey) {
      case "sem_envio":
        conditions.push({
          AND: [
            { messages: { none: vendedorId ? { campaign: { vendedorId } } : {} } },
            { lastContactedAt: null },
          ],
        })
        break

      case "aguardando":
        conditions.push({ messages: { some: { status: { in: ["PENDING", "SENDING"] }, ...msgVendorFilter } } })
        break

      case "enviado":
        conditions.push({ messages: { some: { status: { in: ["SENT", "COMPLETED"] }, ...msgVendorFilter } } })
        break

      case "falhou":
        conditions.push({ messages: { some: { status: "FAILED", ...msgVendorFilter } } })
        break

      case "respondeu": {
        // Include contacts who replied via campaign OR via rmkt
        const rmktPhones = await prisma.remarketingLead
          .findMany({
            where: { replied: true, ...(vendedorUserId ? { userId: vendedorUserId } : {}) },
            select: { number: true },
            take: RMKT_PHONE_LIMIT,
          })
          .then((rows) => rows.map((r) => r.number))
          .catch(() => [] as string[])

        conditions.push({
          OR: [
            { messages: { some: { replied: true, ...msgVendorFilter } } },
            ...(rmktPhones.length > 0 ? [{ phone: { in: rmktPhones } }] : []),
          ],
        })
        break
      }

      case "rmkt": {
        const phones = await prisma.remarketingLead
          .findMany({
            where: { status: "pending", ...(vendedorUserId ? { userId: vendedorUserId } : {}) },
            select: { number: true },
            take: RMKT_PHONE_LIMIT,
          })
          .then((rows) => rows.map((r) => r.number))
          .catch(() => [] as string[])

        // Empty array = no results; Prisma handles { in: [] } as "match nothing"
        conditions.push(phones.length > 0 ? { phone: { in: phones } } : { id: { in: [] } })
        break
      }

      case "rmkt_concluido": {
        const phones = await prisma.remarketingLead
          .findMany({
            where: { status: "completed", ...(vendedorUserId ? { userId: vendedorUserId } : {}) },
            select: { number: true },
            take: RMKT_PHONE_LIMIT,
          })
          .then((rows) => rows.map((r) => r.number))
          .catch(() => [] as string[])

        conditions.push(phones.length > 0 ? { phone: { in: phones } } : { id: { in: [] } })
        break
      }

      default:
        // No journey filter: if a vendedor is selected, scope to contacts they've messaged
        if (vendedorId) {
          conditions.push({ messages: { some: { campaign: { vendedorId } } } })
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any =
      conditions.length === 0 ? {} :
      conditions.length === 1 ? conditions[0] :
      { AND: conditions }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
