import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildContactWhere } from "@/lib/contacts/buildContactWhere"

const EXPORT_LIMIT = 50_000

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const where = await buildContactWhere({
    search:        sp.get("search")?.trim() ?? undefined,
    listId:        sp.get("listId")         ?? undefined,
    vendedorId:    sp.get("vendedorId")     ?? undefined,
    journey:       sp.get("journey")        ?? undefined,
    createdAfter:  sp.get("createdAfter")   ?? undefined,
    createdBefore: sp.get("createdBefore")  ?? undefined,
  })

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    select: {
      id: true, phone: true, name: true, tags: true,
      variables: true, createdAt: true, lastContactedAt: true,
      listItems: { select: { list: { select: { name: true } } } },
    },
  })

  // Collect all variable keys across all contacts for consistent columns
  const varKeys = Array.from(
    new Set(contacts.flatMap((c) => Object.keys((c.variables as Record<string, string>) ?? {})))
  ).sort()

  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const headers = ["id", "telefone", "nome", "tags", "listas", "criado_em", "ultimo_contato", ...varKeys]
  const rows = contacts.map((c) => {
    const vars = (c.variables as Record<string, string>) ?? {}
    return [
      c.id,
      c.phone,
      c.name ?? "",
      c.tags.join(";"),
      c.listItems.map((li) => li.list.name).join(";"),
      c.createdAt.toISOString(),
      c.lastContactedAt?.toISOString() ?? "",
      ...varKeys.map((k) => vars[k] ?? ""),
    ].map(escape).join(",")
  })

  const csv = [headers.join(","), ...rows].join("\n")
  const filename = `contatos_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
