import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const leads = await prisma.remarketingLead.findMany({
    where: { campaignId: id },
    orderBy: { nextRun: "asc" },
    take: 200,
    select: {
      id: true,
      number: true,
      name: true,
      currentStep: true,
      nextRun: true,
      status: true,
      replied: true,
      failCount: true,
      lastSentAt: true,
    },
  })

  return NextResponse.json(leads)
}
