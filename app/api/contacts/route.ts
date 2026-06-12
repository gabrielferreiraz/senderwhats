import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20"))
  const search = searchParams.get("search")?.trim() ?? ""
  const listId = searchParams.get("listId") ?? undefined

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } },
      ],
    }),
    ...(listId && { listItems: { some: { listId } } }),
  }

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
        createdAt: true,
        _count: { select: { listItems: true } },
        listItems: { select: { list: { select: { id: true, name: true } } } },
      },
    }),
    prisma.contact.count({ where }),
  ])

  return NextResponse.json({
    contacts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
