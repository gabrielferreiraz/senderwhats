import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await prisma.campaignMessage.updateMany({
    where: { id, status: { in: ["PENDING", "SENDING"] } },
    data: { status: "SKIPPED" },
  })

  return NextResponse.json({ ok: result.count > 0 })
}
