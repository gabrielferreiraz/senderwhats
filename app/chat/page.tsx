import { prisma } from "@/lib/prisma"
import { ChatClient } from "@/components/chat/ChatClient"

export const dynamic = "force-dynamic"

export default async function ChatPage() {
  const vendedores = await prisma.vendedor.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, userId: true },
  })

  return (
    <div className="h-[calc(100vh-3.5rem)] -m-6">
      <ChatClient vendedores={vendedores} />
    </div>
  )
}
