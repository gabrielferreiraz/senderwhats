/**
 * SenderWhats Background Worker
 * Run: npx tsx worker/index.ts
 *
 * Ticks every 10 seconds:
 *   1. Activates SCHEDULED campaigns whose scheduledAt <= now (UTC)
 *   2. For each RUNNING campaign:
 *      a. Validates schedule window using Brasília timezone
 *      b. Checks daily contact limit per rule
 *      c. Picks PENDING/SENDING messages whose nextSendAt <= now
 *      d. Applies spintax + variables, calls WhatsApp API
 *      e. Advances to next step or marks COMPLETED
 *      f. Applies humanized random delay between leads (anti-ban)
 */

import "dotenv/config"
import cron from "node-cron"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// ─── Timezone ─────────────────────────────────────────────────────────────────
// Brazil abolished DST in April 2019 — Brasília is permanently UTC-3.
// We use direct arithmetic (Date.now() - 3h) instead of Intl.DateTimeFormat
// to avoid any ICU/tzdata issues on the server's Alpine container.

/** Shift UTC timestamp to Brasília (UTC-3) keeping it as a plain Date. */
function brt(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000)
}

/** Current day-of-week (0=Sun … 6=Sat) and "HH:MM" in Brasília time. */
function brasiliaDateParts(): { day: number; hhmm: string } {
  const d = brt()
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return { day: d.getUTCDay(), hhmm: `${hh}:${mm}` }
}

/**
 * UTC Date that equals the start of today (00:00:00) in Brasília.
 * Brasília midnight = UTC 03:00, so we anchor on that.
 */
function brasiliaStartOfDay(): Date {
  const d = brt()
  // Use UTC fields of the shifted date to get the Brasília calendar date,
  // then add 3 h back to express midnight BRT as a UTC instant.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 3, 0, 0))
}

/**
 * UTC Date for the start of the current week (last Monday midnight) in Brasília.
 * Weeks start on Monday; Sun counts as 6 days after Monday.
 */
function brasiliaStartOfWeek(): Date {
  const { day } = brasiliaDateParts()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  return new Date(brasiliaStartOfDay().getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
}

// ─── Inline lib imports (relative paths — tsx doesn't resolve @ alias) ────────

function normalizePhone(raw: string): string {
  let clean = raw.replace(/\D/g, "")
  clean = clean.replace(/^0+/, "")
  if (clean.length < 8) return clean
  if (clean.startsWith("55") && clean.length >= 12) clean = clean.slice(2)
  if (clean.length === 8 || clean.length === 9) {
    if (clean.length === 8 && ["6","7","8","9"].includes(clean[0] ?? "")) clean = "9" + clean
    clean = "11" + clean
  }
  if (clean.length === 10) {
    const ddd = clean.slice(0, 2)
    const local = clean.slice(2)
    if (["6","7","8","9"].includes(local[0] ?? "")) clean = ddd + "9" + local
  }
  return "55" + clean
}

function processSpintax(text: string): string {
  return text.replace(/\{\[([^\]]+)\]\}/g, (_, options: string) => {
    const parts = options.split("|")
    return parts[Math.floor(Math.random() * parts.length)] ?? ""
  })
}

type ContactLike = {
  name?: string | null
  phone: string
  variables?: unknown
}

const PT_PREPOSITIONS = new Set(["de","da","do","das","dos","e","em","na","no","nas","nos","a","o"])

function getFirstName(name: string | null | undefined): string {
  if (!name?.trim()) return ""
  const first = name.trim().split(/\s+/)[0] ?? ""
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function formatTitleCase(name: string | null | undefined): string {
  if (!name?.trim()) return ""
  return name.trim().toLowerCase().split(/\s+/).map((w, i) =>
    i > 0 && PT_PREPOSITIONS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ")
}

function applyVariables(template: string, contact: ContactLike): string {
  let result = template
  result = result.replace(/\{nome\}/gi, getFirstName(contact.name))
  result = result.replace(/\{primeiro_nome\}/gi, getFirstName(contact.name))
  result = result.replace(/\{nome_completo\}/gi, formatTitleCase(contact.name))
  result = result.replace(/\{nome_bruto\}/gi, contact.name ?? "")
  result = result.replace(/\{telefone\}/gi, contact.phone)
  if (contact.variables && typeof contact.variables === "object") {
    for (const [key, value] of Object.entries(contact.variables as Record<string, unknown>)) {
      const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      result = result.replace(new RegExp(`\\{${safeKey}\\}`, "gi"), String(value ?? ""))
    }
  }
  return result
}

const WHATSAPP_BASE = process.env.WHATSAPP_API_URL ?? "http://localhost:8080"

async function sendText(userId: string, number: string, message: string): Promise<void> {
  const res = await fetch(`${WHATSAPP_BASE}/message/send-text/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number, message }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WhatsApp API → ${res.status}: ${text}`)
  }
}

/** Fetches all active+authenticated instances in a single HTTP call. Returns a Set of ready userIds. */
async function fetchReadyInstances(): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${WHATSAPP_BASE}/instance/active`)
    if (!res.ok) {
      log("⚠️", `Falha ao buscar instâncias WhatsApp (${res.status})`)
      return null
    }
    const data = await res.json() as { instances: Array<{ userId: string; ready: boolean; authenticated: boolean }> }
    const ready = new Set<string>()
    for (const inst of data.instances) {
      if (inst.ready && inst.authenticated) ready.add(inst.userId)
    }
    return ready
  } catch (err) {
    log("⚠️", `Erro ao buscar instâncias WhatsApp: ${errMsg(err)}`)
    return null
  }
}

// ─── Prisma singleton ─────────────────────────────────────────────────────────

function createPrisma() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter, log: ["error"] })
}

const prisma = createPrisma()

// ─── Utilities ────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function classifyFailure(reason: string): string {
  if (/não possui whatsapp|no whatsapp|not registered|number not/i.test(reason)) return "no_whatsapp"
  if (/desconect|disconnect|session|sessão/i.test(reason)) return "session_error"
  if (/timeout|timed out|econnrefused|enotfound/i.test(reason)) return "timeout"
  return "unknown"
}

// ─── Schedule window helpers ──────────────────────────────────────────────────

/**
 * Returns true when {day, hhmm} falls inside a single schedule rule.
 * Handles windows that cross midnight (e.g. startTime="22:00" endTime="02:00"):
 *   if startTime > endTime the window wraps around into the next calendar day.
 */
function matchesWindow(
  r: { dayOfWeek: number; startTime: string; endTime: string },
  day: number,
  hhmm: string
): boolean {
  if (r.startTime <= r.endTime) {
    // Normal window: e.g. 09:00–18:00
    return r.dayOfWeek === day && hhmm >= r.startTime && hhmm < r.endTime
  }
  // Midnight-crossing: e.g. 22:00–02:00
  // The rule covers: dayOfWeek from startTime → midnight, AND the next day midnight → endTime
  const nextDay = (r.dayOfWeek + 1) % 7
  return (
    (r.dayOfWeek === day && hhmm >= r.startTime) ||
    (nextDay   === day && hhmm <  r.endTime)
  )
}

/**
 * Returns true if the current Brasília time falls inside any rule.
 * Accepts pre-computed {day, hhmm} so the timezone conversion runs only once per tick.
 */
function isInWindow(
  rules: { dayOfWeek: number; startTime: string; endTime: string }[],
  day: number,
  hhmm: string
): boolean {
  if (rules.length === 0) return true // no rules = always active
  return rules.some((r) => matchesWindow(r, day, hhmm))
}

/** Returns how many contacts were already sent within the given period for a campaign.
 *  period: "hour" = last 60 min | "day" = since Brasília midnight | "week" = since last Monday */
async function sentSince(campaignId: string, period: string): Promise<number> {
  let since: Date
  if (period === "hour") {
    since = new Date(Date.now() - 60 * 60 * 1000)
  } else if (period === "week") {
    since = brasiliaStartOfWeek()
  } else {
    since = brasiliaStartOfDay() // default: "day"
  }
  return prisma.campaignMessage.count({
    where: {
      campaignId,
      status: { in: ["SENT", "SENDING", "COMPLETED"] },
      sentAt: { gte: since },
    },
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe status update — uses updateMany so it never throws P2025 if the record was deleted */
async function updateMsg(id: string, data: Parameters<typeof prisma.campaignMessage.updateMany>[0]["data"]) {
  await prisma.campaignMessage.updateMany({ where: { id }, data })
}

// ─── Core: process a single CampaignMessage ───────────────────────────────────

async function processMessage(
  msgId: string,
  campaignId: string,
  contactId: string,
  currentStep: number,
  vendedorUserId: string,
  msgTemplateId: string | null,       // A/B: per-message template (priority)
  campaignTemplateId: string | null,  // fallback from campaign
  customMessage: string | null
): Promise<void> {
  // Message-specific template takes priority over the campaign default
  const templateId = msgTemplateId ?? campaignTemplateId

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) {
    await updateMsg(msgId, { status: "FAILED", failureReason: "Contato não encontrado", failureCategory: "unknown" })
    return
  }

  // No template but has customMessage → send once and complete
  if (!templateId) {
    if (!customMessage?.trim()) {
      // No content configured — skip silently rather than pretend success
      log("⏩", `Msg ${msgId} sem template e sem mensagem direta — marcando como SKIPPED`)
      await updateMsg(msgId, { status: "SKIPPED" })
      return
    }

    const text = applyVariables(processSpintax(customMessage), contact)
    const phone = normalizePhone(contact.phone)
    try {
      await sendText(vendedorUserId, phone, text)
      log("✅", `Msg direta → ${phone} (${contact.name ?? "sem nome"})`)
      await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date(), nextSendAt: null })
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      log("❌", `Falha → ${phone}: ${reason}`)
      await updateMsg(msgId, { status: "FAILED", sentAt: new Date(), failureReason: reason.slice(0, 500), failureCategory: classifyFailure(reason) })
    }
    return
  }

  // Template-based: find current step
  const step = await prisma.templateStep.findFirst({
    where: { templateId, stepOrder: currentStep },
  })

  if (!step) {
    await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date() })
    return
  }

  const text = applyVariables(processSpintax(step.body), contact)
  const phone = normalizePhone(contact.phone)

  try {
    await sendText(vendedorUserId, phone, text)
    log("✅", `Passo ${currentStep} → ${phone} (${contact.name ?? "sem nome"})`)

    const hasNextStep = await prisma.templateStep.count({
      where: { templateId, stepOrder: currentStep + 1 },
    })

    if (hasNextStep > 0) {
      await updateMsg(msgId, {
        currentStep: currentStep + 1,
        status: "SENDING",
        sentAt: new Date(),
        nextSendAt: new Date(Date.now() + step.delayAfter * 1000),
      })
    } else {
      await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date(), nextSendAt: null })
    }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    log("❌", `Falha → ${phone}: ${reason}`)
    await updateMsg(msgId, { status: "FAILED", sentAt: new Date(), failureReason: reason.slice(0, 500), failureCategory: classifyFailure(reason) })
  }
}

// ─── Cross-tick failure tracker ──────────────────────────────────────────────
// Persists across ticks (in-memory). Auto-pauses campaign after N consecutive
// failures so a dead WhatsApp session doesn't silently waste the entire queue.

const campaignFailStreak = new Map<string, number>()
const MAX_FAIL_STREAK = 5

function recordFailure(campaignId: string): number {
  const n = (campaignFailStreak.get(campaignId) ?? 0) + 1
  campaignFailStreak.set(campaignId, n)
  return n
}

function recordSuccess(campaignId: string): void {
  campaignFailStreak.delete(campaignId)
}

// ─── Core: tick ───────────────────────────────────────────────────────────────

let ticking = false

async function tick(): Promise<void> {
  if (ticking) return
  ticking = true

  // Compute Brasília time ONCE per tick — all window checks share it.
  const { day, hhmm } = brasiliaDateParts()
  log("🕐", `Tick — Brasília: ${hhmm}, dia ${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][day] ?? day}`)

  try {
    // ── 1. Activate SCHEDULED campaigns whose time has come ───────────────────
    try {
      const due = await prisma.campaign.findMany({
        where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
        select: { id: true, name: true },
      })
      for (const c of due) {
        try {
          await prisma.campaign.update({ where: { id: c.id }, data: { status: "RUNNING" } })
          log("🚀", `Campanha agendada "${c.name}" → iniciando`)
        } catch (err) {
          log("⚠️", `Falha ao ativar campanha "${c.name}": ${errMsg(err)}`)
        }
      }
    } catch (err) {
      // DB may be temporarily unreachable — log and continue to process RUNNING campaigns
      log("⚠️", `Erro ao buscar campanhas agendadas (banco indisponível?): ${errMsg(err)}`)
    }

    // ── 2. Fetch all RUNNING campaigns ────────────────────────────────────────
    // Using .catch(() => null) preserves Prisma's inferred include types.
    const campaigns = await prisma.campaign.findMany({
      where: { status: "RUNNING" },
      include: {
        vendedor: { select: { userId: true } },
        scheduleRules: true,
      },
    }).catch((err: unknown) => {
      log("⚠️", `Erro crítico ao buscar campanhas em execução (banco indisponível?): ${errMsg(err)}`)
      return null
    })

    if (!campaigns || campaigns.length === 0) return

    // ── Fetch all ready WhatsApp instances once (O(1) vs O(N) HTTP calls) ────
    const readyUserIds = await fetchReadyInstances()
    if (readyUserIds === null) {
      log("⚠️", "Não foi possível verificar instâncias WhatsApp — tick ignorado")
      return
    }

    for (const campaign of campaigns) {
      // Each campaign is wrapped independently: one campaign's DB error
      // must never prevent other campaigns from being processed.
      try {
        // ── WhatsApp instance health ─────────────────────────────────────────
        const userId = campaign.vendedor.userId
        if (!readyUserIds.has(userId)) {
          log("📵", `Instância "${userId}" não pronta — "${campaign.name}" aguardando reconexão`)
          continue
        }

        // ── Schedule window check (Brasília time, midnight-crossing safe) ────
        if (!isInWindow(campaign.scheduleRules, day, hhmm)) {
          log("⏰", `"${campaign.name}" fora da janela de envio (${hhmm}) — aguardando`)
          continue
        }

        // ── Contact limit per rule (hour / day / week) ────────────────────────
        const todayRules = campaign.scheduleRules.filter((r) => matchesWindow(r, day, hhmm))
        let limitReached = false
        for (const r of todayRules) {
          if (r.maxContacts === null) continue
          let sent = 0
          try {
            sent = await sentSince(campaign.id, r.maxContactsPeriod)
          } catch (err) {
            log("⚠️", `Erro ao contar envios de "${campaign.name}": ${errMsg(err)}`)
            limitReached = true
            break
          }
          if (sent >= r.maxContacts) {
            const periodLabel =
              r.maxContactsPeriod === "hour" ? "hora" :
              r.maxContactsPeriod === "week" ? "semana" : "dia"
            log("📊", `"${campaign.name}" atingiu limite de ${r.maxContacts} contatos por ${periodLabel}`)
            limitReached = true
            break
          }
        }
        if (limitReached) continue

        // ── Sequential: one lead at a time ───────────────────────────────────
        // Priority:
        //   1. If a lead is mid-sequence (SENDING) and its next step is due → continue it
        //   2. Else if a between-leads delay is still active (PENDING with future
        //      nextSendAt) → block: do not start another lead yet
        //   3. Else → start the next PENDING lead (take: 1)
        const activeSending = await prisma.campaignMessage.findFirst({
          where: { campaignId: campaign.id, status: "SENDING" },
        })

        const scheduledNext = activeSending ? null : await prisma.campaignMessage.findFirst({
          where: { campaignId: campaign.id, status: "PENDING", nextSendAt: { gt: new Date() } },
        })

        const messages = scheduledNext
          ? ([] as Awaited<ReturnType<typeof prisma.campaignMessage.findMany>>)
          : activeSending
            ? await prisma.campaignMessage.findMany({
                where: {
                  campaignId: campaign.id,
                  status: "SENDING",
                  OR: [{ nextSendAt: null }, { nextSendAt: { lte: new Date() } }],
                },
                orderBy: { nextSendAt: "asc" },
              })
            : await prisma.campaignMessage.findMany({
                where: {
                  campaignId: campaign.id,
                  status: "PENDING",
                  OR: [{ nextSendAt: null }, { nextSendAt: { lte: new Date() } }],
                },
                take: 1,
                orderBy: [
                  { nextSendAt: { sort: "asc", nulls: "last" } },
                  { createdAt: "asc" },
                ],
              })

        if (messages.length === 0) {
          const remaining = await prisma.campaignMessage.count({
            where: { campaignId: campaign.id, status: { in: ["PENDING", "SENDING"] } },
          })
          if (remaining === 0) {
            await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } })
            const total = await prisma.campaignMessage.count({ where: { campaignId: campaign.id } })
            log(
              total > 0 ? "🏁" : "⚠️",
              total > 0
                ? `Campanha "${campaign.name}" concluída!`
                : `Campanha "${campaign.name}" sem contatos — encerrando automaticamente`
            )
          }
          continue
        }

        log(
          activeSending ? "📨" : "🔄",
          activeSending
            ? `"${campaign.name}" — continuando sequência (passo ${messages[0]?.currentStep ?? "?"})`
            : `"${campaign.name}" — iniciando próximo lead`
        )

        for (const msg of messages) {
          // Skip if already processed (race with "send now" or manual action)
          const fresh = await prisma.campaignMessage.findUnique({
            where: { id: msg.id },
            select: { status: true },
          })
          if (fresh && fresh.status !== "PENDING" && fresh.status !== "SENDING") {
            log("⏩", `Msg ${msg.id} já processada (${fresh.status}) — pulando`)
            continue
          }

          try {
            await processMessage(
              msg.id,
              campaign.id,
              msg.contactId,
              msg.currentStep,
              campaign.vendedor.userId,
              msg.templateId,          // A/B: per-message template (null for legacy rows)
              campaign.templateId,     // fallback campaign default
              campaign.customMessage
            )
          } catch (err) {
            log("⚠️", `Erro inesperado na msg ${msg.id}: ${errMsg(err)}`)
          }

          // Check final status for circuit breaker and between-leads delay
          const afterStatus = await prisma.campaignMessage.findUnique({
            where: { id: msg.id },
            select: { status: true },
          })

          if (afterStatus?.status === "FAILED") {
            const streak = recordFailure(campaign.id)
            if (streak >= MAX_FAIL_STREAK) {
              log(
                "🚨",
                `${streak} falhas consecutivas em "${campaign.name}" — pausando. Verifique a sessão WhatsApp e retome manualmente.`
              )
              await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } })
              break
            }
          } else if (afterStatus?.status === "COMPLETED" || afterStatus?.status === "SENT") {
            recordSuccess(campaign.id)
          }

          // Lead finished → apply between-leads delay to the next PENDING contact
          if (afterStatus?.status === "COMPLETED" || afterStatus?.status === "FAILED") {
            const nextInQueue = await prisma.campaignMessage.findFirst({
              where: {
                campaignId: campaign.id,
                status: "PENDING",
                OR: [{ nextSendAt: null }, { nextSendAt: { lte: new Date() } }],
              },
              orderBy: { nextSendAt: "asc" },
            })
            if (nextInQueue) {
              const delaySec = randomBetween(campaign.minDelay, campaign.maxDelay)
              await prisma.campaignMessage.updateMany({
                where: { id: nextInQueue.id },
                data: { nextSendAt: new Date(Date.now() + delaySec * 1000) },
              })
              log("⏳", `Aguardando ${delaySec}s antes do próximo lead...`)
            }
          }
        }
      } catch (err) {
        // A DB outage or unexpected throw in a single campaign must not kill the loop
        log("⚠️", `Erro não tratado em "${campaign.name}" — continuando com as demais: ${errMsg(err)}`)
      }
    }
  } finally {
    ticking = false
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string): void {
  const d = brt()
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  const ss = String(d.getUTCSeconds()).padStart(2, "0")
  console.log(`[${hh}:${mm}:${ss}] ${emoji}  ${msg}`)
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const { hhmm: bootTime } = brasiliaDateParts()
console.log("╔════════════════════════════════════════════╗")
console.log("║   SenderWhats Worker  •  iniciando...      ║")
console.log("╚════════════════════════════════════════════╝")
console.log(`Banco: ${process.env.DATABASE_URL?.split("@")[1] ?? "?"}`)
console.log(`WhatsApp API: ${WHATSAPP_BASE}`)
console.log(`Horário Brasília: ${bootTime}`)
console.log("Tick: a cada 10 segundos\n")

tick()
cron.schedule("*/10 * * * * *", tick)
