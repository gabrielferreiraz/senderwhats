import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/campaign-messages/[id]/send-now
 *
 * Sets nextSendAt = now so the worker picks it up on the next tick (≤10s).
 * All actual sending stays in the worker — no concurrency risk.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Atomic check-and-update: only acts if still PENDING or SENDING.
  // updateMany never throws P2025 if nothing matches.
  const result = await prisma.campaignMessage.updateMany({
    where: { id, status: { in: ["PENDING", "SENDING"] } },
    data: { nextSendAt: new Date() },
  })

  if (result.count === 0) {
    // Either not found or already SENT/COMPLETED/FAILED — safe to ignore
    return NextResponse.json({ ok: false, reason: "noop" })
  }

  return NextResponse.json({ ok: true })
}
