import { NextResponse } from "next/server"

type ActiveInstance = {
  userId: string
  instanceId: string
  ready: boolean
  authenticated: boolean
  state: string | null
  number: string | null
  queueLength: number
}

type ActiveResponse = {
  total: number
  instances: ActiveInstance[]
}

export async function GET() {
  try {
    const url = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
    const res = await fetch(`${url}/instance/active`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ online: 0, total: 0 })

    const data = (await res.json()) as ActiveResponse
    const instances = data.instances ?? []
    const online = instances.filter((i) => i.ready).length

    return NextResponse.json({ online, total: instances.length })
  } catch {
    return NextResponse.json({ online: 0, total: 0 })
  }
}
