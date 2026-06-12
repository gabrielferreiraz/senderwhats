import { prisma } from "@/lib/prisma"
import { VendedoresGrid } from "@/components/instancias/VendedoresGrid"

export const dynamic = "force-dynamic"

async function getVendedores() {
  return prisma.vendedor.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { campanhas: true, listas: true } } },
  })
}

export default async function InstanciasPage() {
  const vendedores = await getVendedores()

  const serialized = vendedores.map((v) => ({
    ...v,
    createdAt: v.createdAt.toISOString(),
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <VendedoresGrid initial={serialized} />
    </div>
  )
}
