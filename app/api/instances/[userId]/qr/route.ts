import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.API_KEY ?? ""

export type QrResponse =
  | { phase: "qr_available"; base64: string }
  | { phase: "already_connected" }
  | { phase: "initializing" }
  | { phase: "error"; message: string }

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}
}

function tag(userId: string) {
  return `[qr/${userId}]`
}

// ─── Tipos da API WhatsApp (após item 5 + 7 do prompt) ───────────────────────

type ApiQrResponse = {
  qr?: string | null
  // Legado — alguns formatos anteriores
  qrCode?: string
  base64?: string
  data?: string
  image?: string
  // Novo campo granular (item 7)
  status?: "ready" | "qr_pending" | "initializing" | "not_found"
}

type ApiStatusResponse = {
  status?: "ready" | "qr_pending" | "initializing" | "disconnected" | "not_found"
  state?: string | null
  authenticated?: boolean
  readySince?: string | null
  lastError?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type QrApiResult =
  | { kind: "qr"; base64: string }
  | { kind: "connected" }
  | { kind: "initializing" }
  | { kind: "not_found" }
  | { kind: "error" }

/** Chama /instance/qr e interpreta o retorno granular da API atualizada. */
async function fetchQRFromApi(userId: string): Promise<QrApiResult> {
  try {
    const res = await fetch(`${BASE}/instance/qr/${userId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(6_000),
    })

    if (!res.ok) {
      // 404 = sessão não existe
      if (res.status === 404) return { kind: "not_found" }
      return { kind: "error" }
    }

    const data = (await res.json()) as ApiQrResponse

    // Campo status granular (API atualizada — item 7)
    if (data.status === "ready")       return { kind: "connected" }
    if (data.status === "not_found")   return { kind: "not_found" }
    if (data.status === "initializing") return { kind: "initializing" }

    // QR disponível (status === "qr_pending" ou legado sem campo status)
    const qrStr =
      data.qr ?? data.qrCode ?? data.base64 ?? data.data ?? data.image
    if (typeof qrStr === "string" && qrStr.length > 0) {
      return { kind: "qr", base64: qrStr }
    }

    // Sem QR e sem status → ainda inicializando
    return { kind: "initializing" }
  } catch {
    return { kind: "error" }
  }
}

/** Chama /instance/status e retorna o estado normalizado. */
async function getSessionStatus(
  userId: string
): Promise<"ready" | "initializing" | "qr_pending" | "not_found" | "error"> {
  try {
    const res = await fetch(`${BASE}/instance/status/${userId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    })

    // 404 agora retorna JSON { status: 'not_found' } (item 5)
    if (res.status === 404) return "not_found"
    if (!res.ok) return "error"

    const data = (await res.json()) as ApiStatusResponse

    // Confia no campo status granular da API atualizada
    if (data.status === "ready")        return "ready"
    if (data.status === "qr_pending")   return "qr_pending"
    if (data.status === "initializing") return "initializing"
    if (data.status === "not_found" || data.status === "disconnected") return "not_found"

    // Fallback para APIs sem campo status granular
    if (data.state === "CONNECTED" || data.authenticated) return "ready"
    return "initializing"
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
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ""}`)
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // 1. Tenta obter QR diretamente — API retorna imediatamente (item 7)
  const qrResult = await fetchQRFromApi(userId)
  console.log(tag(userId), `QR endpoint → kind: ${qrResult.kind}`)

  if (qrResult.kind === "connected") {
    return NextResponse.json({ phase: "already_connected" } satisfies QrResponse)
  }
  if (qrResult.kind === "qr") {
    return NextResponse.json({ phase: "qr_available", base64: qrResult.base64 } satisfies QrResponse)
  }
  if (qrResult.kind === "initializing") {
    // Puppeteer aquecendo — modal retenta em 4s
    return NextResponse.json({ phase: "initializing" } satisfies QrResponse)
  }

  // kind === "not_found" ou "error": precisa saber o estado real via /status
  const status = await getSessionStatus(userId)
  console.log(tag(userId), `status → ${status}`)

  if (status === "ready") {
    return NextResponse.json({ phase: "already_connected" } satisfies QrResponse)
  }

  if (status === "not_found") {
    // Cria a sessão e informa ao modal que deve aguardar a inicialização
    try {
      await createSession(userId)
      console.log(tag(userId), "sessão criada — aguardando Puppeteer inicializar")
    } catch (err) {
      console.error(tag(userId), "falha ao criar sessão:", err instanceof Error ? err.message : err)
      return NextResponse.json({ phase: "error", message: "Falha ao criar sessão na API WhatsApp." } satisfies QrResponse)
    }
    return NextResponse.json({ phase: "initializing" } satisfies QrResponse)
  }

  if (status === "qr_pending") {
    // /status diz que tem QR mas /qr falhou — tenta mais uma vez diretamente
    const retry = await fetchQRFromApi(userId)
    if (retry.kind === "qr") {
      return NextResponse.json({ phase: "qr_available", base64: retry.base64 } satisfies QrResponse)
    }
  }

  // initializing ou error → modal retenta
  return NextResponse.json({ phase: "initializing" } satisfies QrResponse)
}
