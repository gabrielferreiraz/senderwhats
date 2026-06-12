import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/phone"

type ImportRow = Record<string, string>

export type DuplicateDetail = {
  phone: string
  name: string | null
  vendors: string[]       // nomes dos vendedores vinculados
  createdAt: string       // ISO date de criação do contato
  lastContact: string | null  // ISO date do último envio (CampaignMessage.sentAt)
}

// Retorna detalhes de até N números duplicados (1 query batch)
const DETAIL_LIMIT = 100

export async function POST(req: NextRequest) {
  const body: {
    rows: ImportRow[]
    phoneCol: string
    nameCol?: string
    listId?: string
    vendedorId?: string
    skipDuplicatesGlobal?: boolean
    skipDuplicatesVendor?: boolean
  } = await req.json()

  const { rows, phoneCol, nameCol, listId, vendedorId, skipDuplicatesGlobal, skipDuplicatesVendor } = body

  if (!rows?.length || !phoneCol) {
    return NextResponse.json({ error: "rows e phoneCol são obrigatórios" }, { status: 400 })
  }

  // ── 1. Normalizar telefones ───────────────────────────────────────────────
  type NormalizedRow = { raw: ImportRow; phone: string }
  const normalizedRows: NormalizedRow[] = []
  let invalid = 0
  for (const row of rows) {
    const digits = (row[phoneCol]?.trim() ?? "").replace(/\D/g, "")
    if (!digits || digits.length < 8) { invalid++; continue }
    const phone = normalizePhone(digits)
    normalizedRows.push({ raw: row, phone })
  }

  // ── 2. Detectar duplicados em batch (1 query) ─────────────────────────────
  const skipSet = new Set<string>()
  const phones = normalizedRows.map((r) => r.phone)

  if (skipDuplicatesGlobal && phones.length > 0) {
    const existing = await prisma.contact.findMany({
      where: { phone: { in: phones } },
      select: { phone: true },
    })
    for (const { phone } of existing) skipSet.add(phone)
  } else if (skipDuplicatesVendor && vendedorId && phones.length > 0) {
    const existing = await prisma.contact.findMany({
      where: { phone: { in: phones }, listItems: { some: { list: { vendedorId } } } },
      select: { phone: true },
    })
    for (const { phone } of existing) skipSet.add(phone)
  }

  // ── 3. Separar duplicados dos que serão importados ───────────────────────
  let duplicates = 0
  let errors = 0
  const duplicatedPhones: string[] = []
  const toImport: NormalizedRow[] = []

  for (const row of normalizedRows) {
    if (skipSet.has(row.phone)) {
      duplicates++
      if (duplicatedPhones.length < DETAIL_LIMIT) duplicatedPhones.push(row.phone)
    } else {
      toImport.push(row)
    }
  }

  // ── 4. Importar em chunks (evita timeout em arquivos grandes) ─────────────
  const CHUNK = 500
  let imported = 0

  for (let i = 0; i < toImport.length; i += CHUNK) {
    const chunk = toImport.slice(i, i + CHUNK)

    // Monta dados dos contatos para createMany
    const contactsData = chunk.map(({ raw: row, phone }) => {
      const name = nameCol ? row[nameCol]?.trim() || null : null
      const vars: Record<string, string> = {}
      for (const [k, v] of Object.entries(row)) {
        if (k !== phoneCol && k !== nameCol && v?.trim()) vars[k] = v.trim()
      }
      return {
        phone,
        ...(name && { name }),
        ...(Object.keys(vars).length > 0 && { variables: vars }),
      }
    })

    try {
      // 1 query para inserir N contatos de uma vez; skipDuplicates ignora conflitos de phone
      await prisma.contact.createMany({ data: contactsData, skipDuplicates: true })
      imported += chunk.length

      if (listId) {
        // Busca IDs dos contatos do chunk (já existentes + recém criados) para vincular à lista
        const existingContacts = await prisma.contact.findMany({
          where: { phone: { in: chunk.map((r) => r.phone) } },
          select: { id: true },
        })
        await prisma.contactListItem.createMany({
          data: existingContacts.map(({ id: contactId }) => ({ contactId, listId })),
          skipDuplicates: true,
        })
      }
    } catch {
      // Bulk insert failed — fall back row-by-row to salvage good rows from the chunk
      for (const data of contactsData) {
        try {
          const c = await prisma.contact.upsert({
            where: { phone: data.phone },
            create: data,
            update: {},
          })
          if (listId) {
            await prisma.contactListItem.createMany({
              data: [{ contactId: c.id, listId }],
              skipDuplicates: true,
            })
          }
          imported++
        } catch {
          errors++
        }
      }
    }
  }

  // ── 4. Buscar detalhes dos duplicados (1 query batch) ─────────────────────
  let duplicateDetails: DuplicateDetail[] = []
  if (duplicatedPhones.length > 0) {
    const contactData = await prisma.contact.findMany({
      where: { phone: { in: duplicatedPhones } },
      select: {
        phone: true,
        name: true,
        createdAt: true,
        listItems: {
          select: {
            list: {
              select: { vendedor: { select: { nome: true } } },
            },
          },
        },
        messages: {
          select: { sentAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })

    duplicateDetails = contactData.map((c) => ({
      phone: c.phone,
      name: c.name,
      vendors: [
        ...new Set(
          c.listItems
            .map((li) => li.list.vendedor?.nome)
            .filter((n): n is string => !!n)
        ),
      ],
      createdAt: c.createdAt.toISOString(),
      lastContact: c.messages[0]?.sentAt?.toISOString() ?? null,
    }))
  }

  return NextResponse.json({
    imported,
    skipped: invalid + duplicates + errors,
    duplicates,
    duplicateDetails,
    duplicateDetailsTruncated: duplicates > DETAIL_LIMIT,
  })
}
