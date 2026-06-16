import { NextRequest, NextResponse } from "next/server"

const BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.API_KEY ?? ""
const authHeaders = (): Record<string, string> =>
  API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}

export type ConnState = "open" | "close" | "connecting"

/**
 * Normalizes the WhatsApp API status into a consistent shape for the frontend.
 *
 * API response after item 5 (granular status):
 *   { status: "ready"|"qr_pending"|"initializing"|"disconnected"|"not_found",
 *     state: string|null, authenticated: bool, readySince: string|null, lastError: string|null }
 *
 * HTTP 404 now returns JSON { status: "not_found" } — body is parseable.
 *
 * Frontend consumers:
 *   - AddVendedorModal uses `state` ("open" = connected, triggers goSuccess)
 *   - VendedorCard uses `status` / `authenticated` / `lastError`
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  try {
    const res = await fetch(`${BASE}/instance/status/${userId}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(5_000),
    })

    if (res.status === 404) {
      // Body is now JSON { status: 'not_found' } — parse it if needed, but
      // the frontend just needs to know the session doesn't exist.
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
      status?: "ready" | "qr_pending" | "initializing" | "disconnected" | "not_found"
      state?: string | null
      authenticated?: boolean
      readySince?: string | null
      lastError?: string | null
    }

    // Trust the granular status field from the updated API (item 5).
    // "ready" means: connected + authenticated + warm-up period elapsed.
    const isReady = data.status === "ready"

    // Map to the ConnState used by AddVendedorModal
    const state: ConnState =
      isReady
        ? "open"
        : data.status === "disconnected" || data.status === "not_found" || data.state === "DISCONNECTED"
        ? "close"
        : "connecting" // initializing | qr_pending

    return NextResponse.json({
      state,
      status: isReady ? "ready" : "not_ready",
      authenticated: data.authenticated ?? isReady,
      lastError: data.lastError ?? null,
      readySince: data.readySince ?? null,
    })
  } catch (err) {
    return NextResponse.json({
      state: "connecting" satisfies ConnState,
      status: "not_ready",
      authenticated: false,
      lastError: err instanceof Error ? err.message : "fetch_failed",
      readySince: null,
    })
  }
}
