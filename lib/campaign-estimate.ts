export type ScheduleRule = {
  dayOfWeek: number       // 0=Dom … 6=Sáb
  startTime: string       // "HH:MM"
  endTime: string         // "HH:MM"
  maxContacts: number | null
  maxContactsPeriod?: string
}

export type ScheduleEstimate = {
  inWindow: boolean
  nextWindowStart: string | null      // ISO — apenas para aritmética de data
  nextWindowStartTime: string | null  // "HH:MM" direto da regra — para exibição (sem conversão de timezone)
  leadsPerDay: number
  avgDelaySeconds: number
  windowSecondsPerDay: number
  estimatedFinishAt: string | null
  workingDaysRemaining: number
}

function parseMinutes(t: string): number {
  const [h = 0, m = 0] = t.split(":").map(Number)
  return h * 60 + m
}

function windowDurSec(r: ScheduleRule): number {
  return Math.max(0, (parseMinutes(r.endTime) - parseMinutes(r.startTime)) * 60)
}

export function computeScheduleEstimate({
  scheduleRules,
  minDelay,
  maxDelay,
  maxSendsPerDay,
  pending,
  now = new Date(),
}: {
  scheduleRules: ScheduleRule[]
  minDelay: number
  maxDelay: number
  maxSendsPerDay: number   // 0 = sem limite
  pending: number
  now?: Date
}): ScheduleEstimate {
  const avgDelaySec = Math.max(1, (minDelay + maxDelay) / 2)

  // Sem regras → roda 24h/dia
  if (scheduleRules.length === 0) {
    const leadsPerDay =
      maxSendsPerDay > 0 ? maxSendsPerDay : Math.floor(86400 / avgDelaySec)
    const estimatedFinishAt =
      pending > 0 && leadsPerDay > 0
        ? new Date(now.getTime() + pending * avgDelaySec * 1000).toISOString()
        : null
    return {
      inWindow: true,
      nextWindowStart: null,
      nextWindowStartTime: null,
      leadsPerDay,
      avgDelaySeconds: avgDelaySec,
      windowSecondsPerDay: 86400,
      estimatedFinishAt,
      workingDaysRemaining:
        leadsPerDay > 0 && pending > 0 ? Math.ceil(pending / leadsPerDay) : 0,
    }
  }

  // ── Verificar se está em janela agora ─────────────────────────────────────
  const nowDow = now.getDay()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const inWindow = scheduleRules.some(
    (r) =>
      r.dayOfWeek === nowDow &&
      parseMinutes(r.startTime) <= nowMin &&
      nowMin < parseMinutes(r.endTime)
  )

  // ── Próxima janela (estritamente após agora) ──────────────────────────────
  let nextWindowStart: string | null = null
  let nextWindowStartTime: string | null = null
  outer: for (let d = 0; d <= 8; d++) {
    const day = new Date(now)
    day.setDate(day.getDate() + d)
    const dow = day.getDay()

    const sorted = scheduleRules
      .filter((r) => r.dayOfWeek === dow)
      .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime))

    for (const rule of sorted) {
      const sm = parseMinutes(rule.startTime)
      const candidate = new Date(day)
      candidate.setHours(Math.floor(sm / 60), sm % 60, 0, 0)
      if (candidate > now) {
        nextWindowStart = candidate.toISOString()
        nextWindowStartTime = rule.startTime  // "HH:MM" da regra — exibir diretamente, sem conversão
        break outer
      }
    }
  }

  // ── Capacidade diária ──────────────────────────────────────────────────────
  const totalWindowSec = scheduleRules.reduce((s, r) => s + windowDurSec(r), 0)
  const avgWindowSec = totalWindowSec / scheduleRules.length

  const rawCapacity = avgWindowSec > 0 ? Math.floor(avgWindowSec / avgDelaySec) : 0

  // Cap por maxContacts das regras (mais restritivo)
  const ruleMax = scheduleRules.reduce<number | null>((min, r) => {
    if (r.maxContacts === null) return min
    return min === null ? r.maxContacts : Math.min(min, r.maxContacts)
  }, null)

  let leadsPerDay = rawCapacity
  if (ruleMax !== null) leadsPerDay = Math.min(leadsPerDay, ruleMax)
  if (maxSendsPerDay > 0) leadsPerDay = Math.min(leadsPerDay, maxSendsPerDay)

  const workingDaysRemaining =
    leadsPerDay > 0 && pending > 0 ? Math.ceil(pending / leadsPerDay) : 0

  // ── Data estimada de conclusão ─────────────────────────────────────────────
  let estimatedFinishAt: string | null = null
  if (pending > 0 && leadsPerDay > 0) {
    let remaining = pending
    const allowedDows = new Set(scheduleRules.map((r) => r.dayOfWeek))

    for (let dayOffset = 0; dayOffset <= 365 && remaining > 0; dayOffset++) {
      const d = new Date(now)
      d.setDate(d.getDate() + dayOffset)
      const dow = d.getDay()
      if (!allowedDows.has(dow)) continue

      const dayRules = scheduleRules.filter((r) => r.dayOfWeek === dow)

      // Segundos disponíveis neste dia
      let availSec: number
      if (dayOffset === 0) {
        availSec = dayRules.reduce((sum, r) => {
          const startMin = parseMinutes(r.startTime)
          const endMin = parseMinutes(r.endTime)
          const effectiveStart = Math.max(startMin, nowMin)
          return sum + Math.max(0, (endMin - effectiveStart) * 60)
        }, 0)
      } else {
        availSec = dayRules.reduce((sum, r) => sum + windowDurSec(r), 0)
      }

      let capacity = availSec > 0 ? Math.floor(availSec / avgDelaySec) : 0

      const dayMax = dayRules.reduce<number | null>((min, r) => {
        if (r.maxContacts === null) return min
        return min === null ? r.maxContacts : Math.min(min, r.maxContacts)
      }, null)
      if (dayMax !== null) capacity = Math.min(capacity, dayMax)
      if (maxSendsPerDay > 0) capacity = Math.min(capacity, maxSendsPerDay)

      if (capacity <= 0) continue

      if (remaining <= capacity) {
        // Termina neste dia — calcular hora exata
        const firstRule = [...dayRules].sort(
          (a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime)
        )[0]!
        const startSecOfDay =
          dayOffset === 0
            ? Math.max(
                now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(),
                parseMinutes(firstRule.startTime) * 60
              )
            : parseMinutes(firstRule.startTime) * 60

        const finishSecOfDay = startSecOfDay + remaining * avgDelaySec
        const finish = new Date(d)
        finish.setHours(
          Math.floor(finishSecOfDay / 3600),
          Math.floor((finishSecOfDay % 3600) / 60),
          Math.round(finishSecOfDay % 60),
          0
        )
        estimatedFinishAt = finish.toISOString()
        break
      }

      remaining -= capacity
    }
  }

  return {
    inWindow,
    nextWindowStart,
    nextWindowStartTime,
    leadsPerDay,
    avgDelaySeconds: avgDelaySec,
    windowSecondsPerDay: avgWindowSec,
    estimatedFinishAt,
    workingDaysRemaining,
  }
}
