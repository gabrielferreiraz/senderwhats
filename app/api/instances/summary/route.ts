import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type ActiveInstance = {
  userId: string
  ready: boolean
}

type ActiveResponse = {
  instances: ActiveInstance[]
}

export async function GET() {
  // Total always comes from DB — source of truth for registered vendedores
  const total = await prisma.vendedor.count({ where: { ativo: true } })

  // Online comes from WhatsApp API — only instances currently connected
  let online = 0
  try {
    const url = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
    const apiKey = process.env.API_KEY ?? ""
    const res = await fetch(`${url}/instance/active`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (res.ok) {
      const data = (await res.json()) as ActiveResponse
      online = (data.instances ?? []).filter((i) => i.ready).length
    }
  } catch {
    // WhatsApp API unreachable — show 0 online, total still correct from DB
  }

  return NextResponse.json({ online, total })
}
