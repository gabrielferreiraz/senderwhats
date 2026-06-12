import { NextRequest, NextResponse } from "next/server"
import { whatsapp } from "@/lib/whatsapp"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  try {
    const insight = await whatsapp.getInsight(userId)
    return NextResponse.json(insight)
  } catch {
    return NextResponse.json({ error: "Instância não encontrada ou offline" }, { status: 502 })
  }
}
