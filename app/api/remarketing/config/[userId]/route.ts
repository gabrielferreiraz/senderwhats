import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

// GET /api/remarketing/config/:userId — Buscar config (com defaults se não existir)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const config = await prisma.remarketingConfig.findUnique({ where: { userId } })

  if (!config) {
    return NextResponse.json({
      userId,
      enabled: false,
      maxFollowUps: 3,
      intervalMinutes: 1440,
      minDelaySec: 15,
      maxDelaySec: 45,
      maxPerDay: 0,
      allowedDays: "1,2,3,4,5",
      windowStart: "09:00",
      windowEnd: "18:00",
      timezone: "America/Campo_Grande",
      scripts: [],
    })
  }

  return NextResponse.json({ ...config, scripts: config.scripts ?? [] })
}

// POST /api/remarketing/config/:userId — Upsert config
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  try {
    const body = await req.json() as {
      enabled?: boolean
      maxFollowUps?: number
      intervalMinutes?: number
      minDelaySec?: number
      maxDelaySec?: number
      maxPerDay?: number
      allowedDays?: string
      windowStart?: string
      windowEnd?: string
      timezone?: string
      scripts?: Prisma.InputJsonValue[]
    }

    const scriptsValue = body.scripts !== undefined
      ? (body.scripts as Prisma.InputJsonValue)
      : undefined

    const config = await prisma.remarketingConfig.upsert({
      where: { userId },
      update: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.maxFollowUps !== undefined && { maxFollowUps: body.maxFollowUps }),
        ...(body.intervalMinutes !== undefined && { intervalMinutes: body.intervalMinutes }),
        ...(body.minDelaySec !== undefined && { minDelaySec: body.minDelaySec }),
        ...(body.maxDelaySec !== undefined && { maxDelaySec: body.maxDelaySec }),
        ...(body.maxPerDay !== undefined && { maxPerDay: body.maxPerDay }),
        ...(body.allowedDays !== undefined && { allowedDays: body.allowedDays }),
        ...(body.windowStart !== undefined && { windowStart: body.windowStart }),
        ...(body.windowEnd !== undefined && { windowEnd: body.windowEnd }),
        ...(body.timezone !== undefined && { timezone: body.timezone }),
        ...(scriptsValue !== undefined && { scripts: scriptsValue }),
      },
      create: {
        userId,
        enabled: body.enabled ?? false,
        maxFollowUps: body.maxFollowUps ?? 3,
        intervalMinutes: body.intervalMinutes ?? 1440,
        minDelaySec: body.minDelaySec ?? 15,
        maxDelaySec: body.maxDelaySec ?? 45,
        maxPerDay: body.maxPerDay ?? 0,
        allowedDays: body.allowedDays ?? "1,2,3,4,5",
        windowStart: body.windowStart ?? "09:00",
        windowEnd: body.windowEnd ?? "18:00",
        timezone: body.timezone ?? "America/Campo_Grande",
        scripts: (body.scripts ?? []) as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json(config)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
