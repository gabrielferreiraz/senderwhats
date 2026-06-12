import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const lists = await prisma.contactList.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  const result = await Promise.all(
    lists.map(async ({ id: listId, name: listName }) => {
      const items = await prisma.contactListItem.findMany({
        where: { listId },
        take: 50,
        select: { contact: { select: { variables: true } } },
      })

      const keys = new Set<string>()
      for (const { contact } of items) {
        if (contact.variables && typeof contact.variables === "object") {
          for (const key of Object.keys(contact.variables as Record<string, unknown>)) {
            keys.add(key)
          }
        }
      }

      return { listId, listName, variables: Array.from(keys).sort() }
    })
  )

  return NextResponse.json(result.filter((r) => r.variables.length > 0))
}
