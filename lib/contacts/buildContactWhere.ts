import { prisma } from "@/lib/prisma"

const RMKT_PHONE_LIMIT = 1000

export type ContactFilter = {
  search?: string
  listId?: string
  vendedorId?: string
  journey?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildContactWhere(filter: ContactFilter): Promise<any> {
  const { search, listId, vendedorId, journey } = filter

  let vendedorUserId: string | undefined
  if (vendedorId) {
    const v = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { userId: true } })
    vendedorUserId = v?.userId
  }

  const msgVendorFilter = vendedorId ? { campaign: { vendedorId } } : {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = []

  if (search?.trim()) {
    conditions.push({
      OR: [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { phone: { contains: search.trim() } },
      ],
    })
  }

  if (listId) conditions.push({ listItems: { some: { listId } } })

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
      if (vendedorId) {
        conditions.push({ messages: { some: { campaign: { vendedorId } } } })
      }
  }

  if (conditions.length === 0) return {}
  if (conditions.length === 1) return conditions[0]
  return { AND: conditions }
}
