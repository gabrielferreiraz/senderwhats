import { prisma } from "@/lib/prisma"
import { ContatosClient } from "@/components/contatos/ContatosClient"

export const dynamic = "force-dynamic"

export default async function ContatosPage() {
  const [lists, vendedores] = await Promise.all([
    prisma.contactList.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } },
        vendedor: { select: { nome: true, userId: true } },
      },
    }),
    prisma.vendedor.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, userId: true } }),
  ])

  const serialized = lists.map((l) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <ContatosClient initialLists={serialized} vendedores={vendedores} />
    </div>
  )
}
