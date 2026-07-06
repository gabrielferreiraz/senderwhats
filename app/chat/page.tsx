import { prisma } from "@/lib/prisma"
import { ChatClient } from "@/components/chat/ChatClient"

export const dynamic = "force-dynamic"

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; userId?: string }>
}) {
  const [vendedores, sp] = await Promise.all([
    prisma.vendedor.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, userId: true },
    }),
    searchParams,
  ])

  return (
    <div className="h-[calc(100vh-3.5rem)] -m-6">
      <ChatClient
        vendedores={vendedores}
        initialPhone={sp.phone}
        initialUserId={sp.userId}
      />
    </div>
  )
}
