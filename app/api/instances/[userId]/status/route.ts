import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"

export type ConnState = "open" | "close" | "connecting"

/**
 * Normalizes whatsapp-web.js status into a consistent shape.
 *
 * WhatsApp API response:
 *   { status: "ready"|"not_ready", state: "CONNECTED"|..., authenticated: bool, lastError: string|null }
 *   404 (plain text) → session does not exist
 *
 * Returns both:
 *   - `state` (normalized: "open"|"close"|"connecting") — used by AddVendedorModal
 *   - `status` / `authenticated` / `lastError` — used by VendedorCard
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  try {
    const res = await fetch(`${BASE}/instance/status/${userId}`)

    // 404 = session not found (plain text body — do not call .json())
    if (res.status === 404) {
      return NextResponse.json({
        state: "close" satisfies ConnState,
        status: "not_ready",
        authenticated: false,
        lastError: "session_not_found",
      })
    }

    if (!res.ok) {
      return NextResponse.json({
        state: "connecting" satisfies ConnState,
        status: "not_ready",
        authenticated: false,
        lastError: `api_error_${res.status}`,
      })
    }

    const data = (await res.json()) as {
      status?: string
      state?: string | null
      authenticated?: boolean
      lastError?: string | null
    }

    // ready = Puppeteer client fully connected and authenticated
    const isReady = data.status === "ready" || data.state === "CONNECTED"

    const state: ConnState = isReady
      ? "open"
      : data.state === "DISCONNECTED" || data.state === null
      ? "close"
      : "connecting"

    return NextResponse.json({
      state,
      status: isReady ? "ready" : "not_ready",
      authenticated: data.authenticated ?? isReady,
      lastError: data.lastError ?? null,
    })
  } catch (err) {
    return NextResponse.json({
      state: "connecting" satisfies ConnState,
      status: "not_ready",
      authenticated: false,
      lastError: err instanceof Error ? err.message : "fetch_failed",
    })
  }
}
