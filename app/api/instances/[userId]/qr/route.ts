import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.API_KEY ?? ""
const authHeaders = (): Record<string, string> =>
  API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function tag(userId: string) {
  return `[qr/${userId}]`
}

async function ensureInstanceCreated(userId: string): Promise<void> {
  try {
    const res = await fetch(`${BASE}/instance/create/${userId}`, { headers: authHeaders() })
    console.log(tag(userId), `create → HTTP ${res.status}`)
  } catch (err) {
    console.error(tag(userId), "create → fetch error:", err instanceof Error ? err.message : err)
  }
}

async function tryFetchQR(userId: string, attempt: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/instance/qr/${userId}`, { headers: authHeaders() })
    if (!res.ok) {
      console.log(tag(userId), `attempt ${attempt} → HTTP ${res.status} (not ready)`)
      return null
    }
    const data = (await res.json()) as Record<string, unknown>
    console.log(tag(userId), `attempt ${attempt} → 200, keys:`, Object.keys(data).join(", "))

    // Try every known field name the WhatsApp API might use
    const qr = data.qrCode ?? data.base64 ?? data.qr ?? data.data ?? data.image
    if (typeof qr === "string" && qr.length > 0) return qr
    if (qr && typeof qr === "object") {
      const inner = qr as Record<string, unknown>
      if (typeof inner.base64 === "string") return inner.base64
    }

    // Log the full payload once so we can see the exact shape
    if (attempt === 0) {
      console.log(tag(userId), "full payload:", JSON.stringify(data).slice(0, 300))
    }
    return null
  } catch (err) {
    console.error(tag(userId), `attempt ${attempt} → fetch error:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  console.log(tag(userId), `GET started — BASE=${BASE}`)

  // 1. Quick check — QR may already be ready
  const quick = await tryFetchQR(userId, -1)
  if (quick) {
    console.log(tag(userId), "QR ready on quick check")
    return NextResponse.json({ base64: quick })
  }

  // 2. Ensure instance is started
  await ensureInstanceCreated(userId)

  // 3. Poll while Puppeteer initializes (typically 5–25s).
  //    15 attempts × 2s = 30s max wait.
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(2000)
    const qr = await tryFetchQR(userId, attempt)
    if (qr) {
      console.log(tag(userId), `QR ready at attempt ${attempt}`)
      return NextResponse.json({ base64: qr })
    }
  }

  console.warn(tag(userId), "QR not available after 30s — giving up")
  return NextResponse.json({ base64: null, error: "qr_not_available" })
}
