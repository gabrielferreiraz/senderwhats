import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.API_KEY ?? ""

type SessionState = "not_found" | "ready" | "connecting" | "error"

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function tag(userId: string) {
  return `[qr/${userId}]`
}

async function getSessionState(userId: string): Promise<SessionState> {
  try {
    const res = await fetch(`${BASE}/instance/status/${userId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    })
    if (res.status === 404) return "not_found"
    if (!res.ok) return "error"
    const data = (await res.json()) as { status?: string; state?: string | null }
    if (data.status === "ready" || data.state === "CONNECTED") return "ready"
    return "connecting"
  } catch {
    return "error"
  }
}

async function createSession(userId: string): Promise<void> {
  const res = await fetch(`${BASE}/instance/create/${userId}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  console.log(tag(userId), `create → HTTP ${res.status}`)
}

async function tryFetchQR(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/instance/qr/${userId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>

    const qr = data.qrCode ?? data.base64 ?? data.qr ?? data.data ?? data.image
    if (typeof qr === "string" && qr.length > 0) return qr
    if (qr && typeof qr === "object") {
      const inner = qr as Record<string, unknown>
      if (typeof inner.base64 === "string") return inner.base64
    }
    return null
  } catch {
    return null
  }
}

async function pollForQR(userId: string, maxAttempts = 12): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2_000)
    const qr = await tryFetchQR(userId)
    if (qr) {
      console.log(tag(userId), `QR obtido na tentativa ${i + 1}/${maxAttempts}`)
      return qr
    }
  }
  return null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // 1. QR pode já estar disponível (sessão aguardando scan)
  const quickQR = await tryFetchQR(userId)
  if (quickQR) {
    console.log(tag(userId), "QR disponível imediatamente")
    return NextResponse.json({ base64: quickQR })
  }

  // 2. Determina o estado atual da sessão
  const state = await getSessionState(userId)
  console.log(tag(userId), `estado da sessão: ${state}`)

  if (state === "ready") {
    // Número já está conectado — modal deve avançar para sucesso
    return NextResponse.json({ base64: null, error: "already_connected" })
  }

  if (state === "not_found") {
    // Sessão não existe — cria antes de fazer polling
    try {
      await createSession(userId)
    } catch (err) {
      console.error(tag(userId), "falha ao criar sessão:", err instanceof Error ? err.message : err)
      return NextResponse.json({ base64: null, error: "qr_not_available" })
    }
  }
  // state === "connecting" ou "error": sessão existe, só aguarda o QR aparecer

  // 3. Polling com timeout de 24s (12 × 2s)
  const qr = await pollForQR(userId)
  if (qr) return NextResponse.json({ base64: qr })

  console.warn(tag(userId), "QR não disponível após polling — encerrando")
  return NextResponse.json({ base64: null, error: "qr_not_available" })
}
