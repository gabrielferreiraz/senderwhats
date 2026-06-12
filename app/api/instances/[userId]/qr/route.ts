import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/**
 * The WhatsApp API stores sessions in memory.
 * After a server restart, all sessions are gone — even if the Vendedor exists in our DB.
 * Calling /instance/create/:userId is idempotent-safe:
 *   - Returns 200 + starts Puppeteer if session doesn't exist
 *   - Returns 400 if session already exists (we ignore this)
 */
async function ensureInstanceCreated(userId: string): Promise<void> {
  try {
    await fetch(`${BASE}/instance/create/${userId}`)
    // 400 = already exists (fine), 200 = just created (Puppeteer starting)
  } catch {
    // Network error — will surface in QR polling
  }
}

async function tryFetchQR(userId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/instance/qr/${userId}`)
    if (!res.ok) return null // 404 = QR not ready yet
    const data = (await res.json()) as Record<string, unknown>
    const qr = data.qrCode ?? data.base64
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  // 1. Quick check — QR may already be ready (session still alive after Next.js restart)
  const quick = await tryFetchQR(userId)
  if (quick) return NextResponse.json({ base64: quick })

  // 2. Session not found — ensure the WhatsApp instance exists.
  //    This handles the case where the WhatsApp API server was restarted and lost
  //    all in-memory sessions. The create call is safe to repeat (returns 400 if exists).
  await ensureInstanceCreated(userId)

  // 3. Poll while Puppeteer initializes (typically 5–15s).
  //    6 attempts × 2s = 12s max wait before returning error.
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(2000)
    const qr = await tryFetchQR(userId)
    if (qr) return NextResponse.json({ base64: qr })
  }

  return NextResponse.json({ base64: null, error: "qr_not_available" })
}
