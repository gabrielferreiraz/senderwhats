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
import { readFileSync } from "fs"
import { join } from "path"

// ─── Timezone ─────────────────────────────────────────────────────────────────
// Business timezone: Mato Grosso do Sul (UTC-4), permanently — no DST.
// Direct arithmetic avoids any ICU/tzdata issues on the Alpine container.

const UTC_OFFSET_H = 4 // hours behind UTC

/** Shift UTC timestamp to local time, returned as a plain Date for getUTC* calls. */
function localNow(): Date {
  return new Date(Date.now() - UTC_OFFSET_H * 60 * 60 * 1000)
}

/** Current day-of-week (0=Sun … 6=Sat) and "HH:MM" in local time. */
function brasiliaDateParts(): { day: number; hhmm: string } {
  const d = localNow()
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  return { day: d.getUTCDay(), hhmm: `${hh}:${mm}` }
}

/**
 * UTC Date that equals the start of today (00:00:00) in local time.
 * Local midnight = UTC 04:00 (for UTC-4).
 */
function brasiliaStartOfDay(): Date {
  const d = localNow()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), UTC_OFFSET_H, 0, 0))
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

function getSaudacao(): string {
  const hour = localNow().getUTCHours()
  if (hour >= 6 && hour < 12) return "Bom dia"
  if (hour >= 12 && hour < 18) return "Boa tarde"
  return "Boa noite"
}

function applyVariables(template: string, contact: ContactLike): string {
  let result = template
  result = result.replace(/\{saudacao\}/gi, getSaudacao())
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
const WHATSAPP_API_KEY = process.env.API_KEY ?? ""
// URL base do próprio app Next.js — usada para baixar uploads via HTTP
// (o worker e o servidor web podem rodar em containers diferentes)
const APP_URL = (process.env.SENDERWHATS_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

function authHeader(): Record<string, string> {
  return WHATSAPP_API_KEY ? { Authorization: `Bearer ${WHATSAPP_API_KEY}` } : {}
}

async function sendText(userId: string, number: string, message: string): Promise<string | null> {
  const res = await fetch(`${WHATSAPP_BASE}/message/send-text/${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ number, message }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WhatsApp API → ${res.status}: ${text}`)
  }
  recordSend(userId)
  try {
    const data = await res.json() as { whatsappMessageId?: string }
    return data.whatsappMessageId ?? null
  } catch {
    return null
  }
}

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
}

const AUDIO_MIME_MAP: Record<string, string> = {
  ogg: "audio/ogg; codecs=opus",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
}

const UPLOAD_DIR = join(process.cwd(), "public", "uploads")

async function fetchUpload(relativeUrl: string): Promise<ArrayBuffer> {
  // Extract filename from URL path: /api/uploads/abc.png → abc.png
  const filename = relativeUrl.split("/").pop() ?? ""
  if (filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\")) {
    try {
      const buf = readFileSync(join(UPLOAD_DIR, filename))
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    } catch {
      // File not on disk — fall through to HTTP (e.g. dev environment with separate processes)
    }
  }
  const res = await fetch(`${APP_URL}${relativeUrl}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Upload não encontrado: ${relativeUrl} (HTTP ${res.status})`)
  return res.arrayBuffer()
}

async function sendImage(
  userId: string,
  number: string,
  imageUrl: string,
  caption: string
): Promise<string | null> {
  console.log("[sendImage] fetchUpload →", `${APP_URL}${imageUrl}`)
  const buffer = await fetchUpload(imageUrl)
  console.log("[sendImage] buffer OK, bytes:", buffer.byteLength)

  const ext = (imageUrl.split(".").pop() ?? "jpg").toLowerCase()
  const mimeType = MIME_MAP[ext] ?? "image/jpeg"

  const form = new FormData()
  form.append("number", number)
  if (caption.trim()) form.append("caption", caption.trim())
  form.append("image", new Blob([buffer], { type: mimeType }), `image.${ext}`)

  console.log("[sendImage] enviando para WhatsApp API →", `${WHATSAPP_BASE}/message/send-image/${userId}`)
  const res = await fetch(`${WHATSAPP_BASE}/message/send-image/${userId}`, {
    method: "POST",
    headers: { ...authHeader() },
    body: form,
    signal: AbortSignal.timeout(70_000),
  })
  console.log("[sendImage] resposta API:", res.status)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WhatsApp API → ${res.status}: ${text}`)
  }
  recordSend(userId)
  try {
    const data = await res.json() as { whatsappMessageId?: string }
    return data.whatsappMessageId ?? null
  } catch {
    return null
  }
}

async function sendAudio(userId: string, number: string, audioUrl: string): Promise<string | null> {
  const buffer = await fetchUpload(audioUrl)
  const ext = (audioUrl.split(".").pop() ?? "ogg").toLowerCase()
  const mimeType = AUDIO_MIME_MAP[ext] ?? "audio/ogg"

  const form = new FormData()
  form.append("number", number)
  form.append("audio", new Blob([buffer], { type: mimeType }), `audio.${ext}`)

  const res = await fetch(`${WHATSAPP_BASE}/message/send-audio/${userId}`, {
    method: "POST",
    headers: { ...authHeader() },
    body: form,
    signal: AbortSignal.timeout(70_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WhatsApp API → ${res.status}: ${text}`)
  }
  recordSend(userId)
  try {
    const data = await res.json() as { whatsappMessageId?: string }
    return data.whatsappMessageId ?? null
  } catch {
    return null
  }
}

type InstanceSnapshot = { ready: boolean; authenticated: boolean; state: string | null }

/**
 * Fetches all instances from the WhatsApp API in one call.
 * Returns null when the API itself is unreachable (network error / 5xx) so the
 * caller can skip the tick entirely rather than incorrectly pausing campaigns.
 * Returns a Map (possibly empty) when the API responded — instances absent from
 * the map or with ready=false are genuinely disconnected.
 */
async function fetchReadyInstances(): Promise<Map<string, InstanceSnapshot> | null> {
  try {
    const res = await fetch(`${WHATSAPP_BASE}/instance/active`, { headers: authHeader() })
    if (!res.ok) {
      log("⚠️", `Falha ao buscar instâncias WhatsApp (${res.status}) — tick ignorado`)
      return null
    }
    const data = await res.json() as {
      instances: Array<{ userId: string; ready: boolean; authenticated: boolean; state?: string | null }>
    }
    const map = new Map<string, InstanceSnapshot>()
    for (const inst of data.instances) {
      map.set(inst.userId, {
        ready: inst.ready,
        authenticated: inst.authenticated,
        state: inst.state ?? null,
      })
    }
    return map
  } catch (err) {
    log("⚠️", `Erro ao buscar instâncias WhatsApp: ${errMsg(err)} — tick ignorado`)
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

// ─── Global per-instance rate limiter ─────────────────────────────────────────
// Prevents campaign tick and remarketing tick from sending to the same WhatsApp
// instance back-to-back without respecting the anti-ban gap.
// tryAcquireSendSlot is a synchronous test-and-set — safe in Node.js's
// single-threaded event loop: no yield between the check and the Map.set().
const lastSentByUser = new Map<string, number>() // userId → last send timestamp (ms)

function tryAcquireSendSlot(userId: string, minGapMs: number): boolean {
  const last = lastSentByUser.get(userId)
  if (last !== undefined && Date.now() - last < minGapMs) return false
  lastSentByUser.set(userId, Date.now()) // reserve slot optimistically
  return true
}

function recordSend(userId: string): void {
  lastSentByUser.set(userId, Date.now())
}

function classifyFailure(reason: string): string {
  if (/não possui whatsapp|no whatsapp|not registered|number not/i.test(reason)) return "no_whatsapp"
  if (/desconect|disconnect|session|sessão/i.test(reason)) return "session_error"
  if (/timeout|timed out|econnrefused|enotfound/i.test(reason)) return "timeout"
  // API retorna 503 { error: 'instance_not_ready' } durante warm-up ou WidFactory
  if (/instance_not_ready|WidFactory|Cannot read properties of undefined|not initialized|client not ready/i.test(reason)) return "transient"
  return "unknown"
}

/** Erros transitórios devem ser retentados, não marcados como FAILED permanentemente. */
function isTransient(reason: string): boolean {
  return classifyFailure(reason) === "transient"
}

const MAX_TRANSIENT_RETRIES = 3
const TRANSIENT_DELAY_MS = 60_000 // 60s padrão antes de retentar

/**
 * Extrai o retryAfter (em ms) do corpo JSON da resposta 503 da API.
 * Formato: "WhatsApp API → 503: {"error":"instance_not_ready","retryAfter":5}"
 */
function parseRetryAfterMs(reason: string): number {
  try {
    const jsonStart = reason.indexOf("{")
    if (jsonStart >= 0) {
      const parsed = JSON.parse(reason.slice(jsonStart)) as { retryAfter?: number }
      if (typeof parsed.retryAfter === "number" && parsed.retryAfter > 0) {
        return parsed.retryAfter * 1000
      }
    }
  } catch {}
  return TRANSIENT_DELAY_MS
}

/** Extrai o contador de tentativas transitórias embutido no failureReason. */
function parseTransientRetries(reason: string): number {
  const m = reason.match(/^\[t:(\d+)\]/)
  return m ? parseInt(m[1]!, 10) : 0
}

/** Embute o contador de tentativas no início do failureReason. */
function packTransientRetry(reason: string, attempt: number): string {
  const clean = reason.replace(/^\[t:\d+\]\s*/, "")
  return `[t:${attempt}] ${clean}`.slice(0, 500)
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

/** Persists first-contact timestamp on the Contact so deduplication survives campaign deletion */
async function markContactContacted(contactId: string) {
  await prisma.contact.updateMany({ where: { id: contactId, lastContactedAt: null }, data: { lastContactedAt: new Date() } })
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
      const waMsgId = await sendText(vendedorUserId, phone, text)
      log("✅", `Msg direta → ${phone} (${contact.name ?? "sem nome"})`)
      await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date(), nextSendAt: null, ackStatus: 1, ...(waMsgId && { whatsappMsgId: waMsgId }) })
      await markContactContacted(contactId)
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      if (isTransient(reason)) {
        const retries = parseTransientRetries(reason)
        if (retries < MAX_TRANSIENT_RETRIES) {
          const delayMs = parseRetryAfterMs(reason)
          log("⚠️", `Falha transitória [${retries + 1}/${MAX_TRANSIENT_RETRIES}] → ${phone}: ${reason.slice(0, 120)} (retry em ${delayMs / 1000}s)`)
          await updateMsg(msgId, { status: "PENDING", nextSendAt: new Date(Date.now() + delayMs), failureReason: packTransientRetry(reason, retries + 1) })
          return
        }
        log("❌", `Falha transitória esgotou tentativas → ${phone}: ${reason.slice(0, 120)}`)
      } else {
        log("❌", `Falha → ${phone}: ${reason}`)
      }
      await updateMsg(msgId, { status: "FAILED", sentAt: new Date(), failureReason: reason.slice(0, 500), failureCategory: classifyFailure(reason) })
    }
    return
  }

  // Template-based: find current step
  const step = await prisma.templateStep.findFirst({
    where: { templateId, stepOrder: currentStep },
    select: { body: true, delayAfter: true, stepType: true, imageUrl: true, audioUrl: true },
  })

  if (!step) {
    await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date() })
    return
  }

  const phone = normalizePhone(contact.phone)
  const isImage = step.stepType === "image"
  const isAudio = step.stepType === "audio"

  if (isImage && !step.imageUrl) {
    log("⏩", `Passo ${currentStep} é imagem mas não tem arquivo — marcando como SKIPPED`)
    await updateMsg(msgId, { status: "SKIPPED" })
    return
  }

  if (isAudio && !step.audioUrl) {
    log("⏩", `Passo ${currentStep} é áudio mas não tem arquivo — marcando como SKIPPED`)
    await updateMsg(msgId, { status: "SKIPPED" })
    return
  }

  try {
    let waMsgId: string | null = null
    if (isImage) {
      const caption = applyVariables(processSpintax(step.body), contact)
      waMsgId = await sendImage(vendedorUserId, phone, step.imageUrl!, caption)
      log("🖼️", `Passo ${currentStep} (imagem) → ${phone} (${contact.name ?? "sem nome"})`)
    } else if (isAudio) {
      waMsgId = await sendAudio(vendedorUserId, phone, step.audioUrl!)
      log("🎙️", `Passo ${currentStep} (áudio) → ${phone} (${contact.name ?? "sem nome"})`)
    } else {
      const text = applyVariables(processSpintax(step.body), contact)
      waMsgId = await sendText(vendedorUserId, phone, text)
      log("✅", `Passo ${currentStep} → ${phone} (${contact.name ?? "sem nome"})`)
    }

    const waFields = { ackStatus: 1, ...(waMsgId && { whatsappMsgId: waMsgId }) }

    const hasNextStep = await prisma.templateStep.count({
      where: { templateId, stepOrder: currentStep + 1 },
    })

    if (hasNextStep > 0) {
      await updateMsg(msgId, {
        currentStep: currentStep + 1,
        status: "SENDING",
        sentAt: new Date(),
        nextSendAt: new Date(Date.now() + step.delayAfter * 1000),
        ...waFields,
      })
      await markContactContacted(contactId)
    } else {
      await updateMsg(msgId, { status: "COMPLETED", sentAt: new Date(), nextSendAt: null, ...waFields })
      await markContactContacted(contactId)
    }
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    if (isTransient(reason)) {
      const retries = parseTransientRetries(reason)
      if (retries < MAX_TRANSIENT_RETRIES) {
        const delayMs = parseRetryAfterMs(reason)
        log("⚠️", `Falha transitória [${retries + 1}/${MAX_TRANSIENT_RETRIES}] → ${phone}: ${reason.slice(0, 120)} (retry em ${delayMs / 1000}s)`)
        await updateMsg(msgId, { status: "PENDING", nextSendAt: new Date(Date.now() + delayMs), failureReason: packTransientRetry(reason, retries + 1) })
        return
      }
      log("❌", `Falha transitória esgotou tentativas → ${phone}: ${reason.slice(0, 120)}`)
    } else {
      log("❌", `Falha → ${phone}: ${reason}`)
    }
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
  log("🕐", `Tick — Local: ${hhmm}, dia ${["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][day] ?? day}`)

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
        vendedor: { select: { userId: true, id: true } },
        scheduleRules: true,
      },
    }).catch((err: unknown) => {
      log("⚠️", `Erro crítico ao buscar campanhas em execução (banco indisponível?): ${errMsg(err)}`)
      return null
    })

    if (!campaigns || campaigns.length === 0) return

    // ── Fetch all WhatsApp instance snapshots once per tick ──────────────────
    const instanceSnapshots = await fetchReadyInstances()
    if (instanceSnapshots === null) return // API unreachable — already logged

    for (const campaign of campaigns) {
      // Each campaign is wrapped independently: one campaign's DB error
      // must never prevent other campaigns from being processed.
      try {
        // ── WhatsApp instance health ─────────────────────────────────────────
        // instanceSnapshots is non-null (null causes early return above).
        // Absent from map OR ready=false both mean the instance is disconnected.
        const userId = campaign.vendedor.userId
        const snap = instanceSnapshots.get(userId)
        if (!snap || !snap.ready || !snap.authenticated) {
          const reason = !snap
            ? "não encontrada na lista de instâncias ativas"
            : `state=${snap.state ?? "null"}, ready=${snap.ready}, authenticated=${snap.authenticated}`
          log("📵", `Instância "${userId}" desconectada [${reason}] — pausando "${campaign.name}"`)
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: "PAUSED", forceDispatch: false },
          }).catch((err: unknown) => {
            log("⚠️", `Erro ao pausar "${campaign.name}" por desconexão: ${errMsg(err)}`)
          })
          campaignFailStreak.delete(campaign.id)
          continue
        }

        // ── Mid-sequence check: query before window so we can bypass it ────────
        // A lead already mid-sequence (SENDING) must finish regardless of window.
        const activeSendingEarly = await prisma.campaignMessage.findFirst({
          where: { campaignId: campaign.id, status: "SENDING", replied: false },
          select: { id: true, currentStep: true },
        })

        // ── Schedule window check (Brasília time, midnight-crossing safe) ────
        if (!isInWindow(campaign.scheduleRules, day, hhmm)) {
          if (activeSendingEarly) {
            // Sequence already started — finish it regardless of window
            log("📨", `"${campaign.name}" fora da janela mas continuando sequência ativa (passo ${activeSendingEarly.currentStep})`)
          } else {
            // No active sequence — respect the window
            let forceDispatch = campaign.forceDispatch
            if (forceDispatch === undefined || forceDispatch === null) {
              try {
                const fresh = await prisma.campaign.findUnique({
                  where: { id: campaign.id },
                  select: { forceDispatch: true },
                })
                forceDispatch = fresh?.forceDispatch ?? false
              } catch {
                forceDispatch = false
              }
            }
            if (!forceDispatch) {
              log("⏰", `"${campaign.name}" fora da janela de envio (${hhmm}) — aguardando`)
              continue
            }
            log("⚡", `"${campaign.name}" forçando disparos fora da janela (${hhmm})`)
          }
        }

        // ── Global daily send limit for this campaign ────────────────────────
        if (campaign.maxSendsPerDay > 0) {
          let sentToday = 0
          try {
            sentToday = await prisma.campaignMessage.count({
              where: {
                campaignId: campaign.id,
                sentAt: { gte: brasiliaStartOfDay() },
                status: { in: ["SENT", "SENDING", "COMPLETED"] },
              },
            })
          } catch (err) {
            log("⚠️", `Erro ao contar envios diários de "${campaign.name}": ${errMsg(err)}`)
            continue
          }
          if (sentToday >= campaign.maxSendsPerDay) {
            log("📊", `"${campaign.name}" atingiu limite de ${campaign.maxSendsPerDay} disparos/dia (${sentToday} enviados)`)
            continue
          }
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
        // activeSendingEarly already queried above for the window bypass check.
        const activeSending = activeSendingEarly

        const scheduledNext = activeSending ? null : await prisma.campaignMessage.findFirst({
          where: { campaignId: campaign.id, status: "PENDING", replied: false, nextSendAt: { gt: new Date() } },
        })

        const messages = scheduledNext
          ? ([] as Awaited<ReturnType<typeof prisma.campaignMessage.findMany>>)
          : activeSending
            ? await prisma.campaignMessage.findMany({
                where: {
                  campaignId: campaign.id,
                  status: "SENDING",
                  replied: false,
                  OR: [{ nextSendAt: null }, { nextSendAt: { lte: new Date() } }],
                },
                orderBy: { nextSendAt: "asc" },
              })
            : await prisma.campaignMessage.findMany({
                where: {
                  campaignId: campaign.id,
                  status: "PENDING",
                  replied: false,
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

        // Load remarketing config once per campaign batch, not once per message
        let rmktConfig: { enabled: boolean; intervalMinutes: number; scripts: unknown } | null = null
        if (campaign.enableRemarketing) {
          try {
            rmktConfig = await prisma.remarketingConfig.findUnique({
              where: { userId: campaign.vendedor.userId },
              select: { enabled: true, intervalMinutes: true, scripts: true },
            })
          } catch (err) {
            log("⚠️", `Erro ao carregar config de remarketing para "${campaign.name}": ${errMsg(err)}`)
          }
        }

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

          // Global rate limiter: only between NEW leads (PENDING), not between steps of the
          // same script (SENDING). Step timing is controlled by TemplateStep.delayAfter
          // via nextSendAt — the campaign minDelay applies only to inter-lead gaps.
          if (msg.status !== "SENDING" && !tryAcquireSendSlot(campaign.vendedor.userId, campaign.minDelay * 1000)) {
            log("⏳", `"${campaign.name}" aguardando rate global da instância (envio recente de outra origem)`)
            break
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

          // Enqueue contact in remarketing when campaign message completes (if enabled)
          if (afterStatus?.status === "COMPLETED" && campaign.enableRemarketing && rmktConfig?.enabled) {
            try {
              const scripts = Array.isArray(rmktConfig.scripts) ? rmktConfig.scripts as { templateId: string }[] : []
              if (scripts.length > 0) {
                const contact = await prisma.contact.findUnique({
                  where: { id: msg.contactId },
                  select: { phone: true, name: true },
                })
                if (contact) {
                  const nextRun = new Date(Date.now() + rmktConfig.intervalMinutes * 60 * 1000)
                  // Restart the sequence only if the lead is not currently mid-sequence (status != pending)
                  // This prevents resetting a lead that's already being followed up
                  await prisma.remarketingLead.updateMany({
                    where: { userId: campaign.vendedor.userId, number: contact.phone, status: { not: "pending" } },
                    data: { currentStep: 1, status: "pending", failCount: 0, replied: false, repliedAt: null, triggeredAt: new Date(), nextRun, campaignId: campaign.id },
                  })
                  await prisma.remarketingLead.createMany({
                    data: [{ userId: campaign.vendedor.userId, number: contact.phone, name: contact.name ?? undefined, nextRun, campaignId: campaign.id }],
                    skipDuplicates: true,
                  })
                  log("📋", `Remarketing: ${contact.phone} enfileirado após "${campaign.name}"`)
                }
              }
            } catch (err) {
              log("⚠️", `Erro ao enfileirar remarketing para msg ${msg.id}: ${errMsg(err)}`)
            }
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
  const d = localNow()
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mm = String(d.getUTCMinutes()).padStart(2, "0")
  const ss = String(d.getUTCSeconds()).padStart(2, "0")
  console.log(`[${hh}:${mm}:${ss}] ${emoji}  ${msg}`)
}

// ─── Remarketing / Follow-Up Scheduler ───────────────────────────────────────

let remarketingTicking = false

/**
 * Runs every 2 minutes.
 * For each campaign with enableRemarketing=true, checks pending leads whose
 * nextRun <= now, validates the campaign's own rmkt time window, fetches the
 * right template, sends the follow-up, then advances or completes the lead.
 * Config (scripts, window, delays) lives entirely on the Campaign row.
 */
async function remarketingTick(): Promise<void> {
  if (remarketingTicking) return
  remarketingTicking = true

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { enableRemarketing: true, rmktPaused: false },
      include: { vendedor: { select: { userId: true } } },
    }).catch((err: unknown) => {
      log("⚠️", `Remarketing: erro ao buscar campanhas: ${errMsg(err)}`)
      return null
    })

    if (!campaigns || campaigns.length === 0) return

    const now = new Date()
    // Brasília time — shared across all campaigns this tick
    const { day, hhmm } = brasiliaDateParts()
    const day1to7 = day === 0 ? 7 : day // 0=Sun→7, 1=Mon→1, …, 6=Sat→6

    for (const campaign of campaigns) {
      const userId = campaign.vendedor.userId
      try {
        // ── Time-window check (campaign's own rmkt window) ───────────────────
        const allowed = campaign.rmktAllowedDays.split(",").map((d) => d.trim())
        const inWindow = allowed.includes(String(day1to7))
          && hhmm >= campaign.rmktWindowStart
          && hhmm < campaign.rmktWindowEnd

        if (!inWindow) continue

        // ── Parse scripts array ──────────────────────────────────────────────
        type ScriptEntry = { templateId: string }
        const scripts: ScriptEntry[] = Array.isArray(campaign.rmktScripts)
          ? campaign.rmktScripts as ScriptEntry[]
          : []
        if (scripts.length === 0) continue

        // ── Daily send limit ─────────────────────────────────────────────────
        if (campaign.rmktMaxPerDay > 0) {
          let sentToday = 0
          try {
            sentToday = await prisma.remarketingLead.count({
              where: { campaignId: campaign.id, lastSentAt: { gte: brasiliaStartOfDay() } },
            })
          } catch (err) {
            log("⚠️", `Remarketing "${campaign.name}": erro ao contar envios diários: ${errMsg(err)}`)
            continue
          }
          if (sentToday >= campaign.rmktMaxPerDay) {
            log("📊", `Remarketing "${campaign.name}": limite diário de ${campaign.rmktMaxPerDay} disparos atingido`)
            continue
          }
        }

        // ── Process ONE lead per tick ────────────────────────────────────────
        const lead = await prisma.remarketingLead.findFirst({
          where: { campaignId: campaign.id, status: "pending", replied: false, nextRun: { lte: now } },
          orderBy: { nextRun: "asc" },
        })

        if (!lead) continue

        try {
          if (lead.currentStep > campaign.rmktMaxFollowUps) {
            await prisma.remarketingLead.update({ where: { id: lead.id }, data: { status: "completed" } })
            log("✅", `Remarketing "${campaign.name}": ${lead.number} atingiu maxFollowUps (${campaign.rmktMaxFollowUps})`)
          } else {
            const scriptEntry = scripts[lead.currentStep - 1]
            if (!scriptEntry) {
              await prisma.remarketingLead.update({ where: { id: lead.id }, data: { status: "completed" } })
              log("✅", `Remarketing "${campaign.name}": ${lead.number} completou todos os follow-ups`)
            } else {
              const templateId = scriptEntry.templateId?.trim() ?? ""
              if (!templateId) {
                const newFails = lead.failCount + 1
                if (newFails >= 3) {
                  await prisma.remarketingLead.update({
                    where: { id: lead.id },
                    data: { status: "failed", failCount: newFails, nextRun: new Date(Date.now() + campaign.rmktIntervalMinutes * 60 * 1000) },
                  })
                  log("🚨", `Remarketing "${campaign.name}": ${lead.number} falhou — templateId vazio no passo ${lead.currentStep}`)
                } else {
                  await prisma.remarketingLead.update({
                    where: { id: lead.id },
                    data: { failCount: newFails, nextRun: new Date(Date.now() + 30 * 60 * 1000) },
                  })
                  log("⚠️", `Remarketing "${campaign.name}": templateId vazio no passo ${lead.currentStep} para ${lead.number} — retry em 30min`)
                }
              } else {
                const step = await prisma.templateStep.findFirst({
                  where: { templateId, stepOrder: 1 },
                  select: { body: true, stepType: true, imageUrl: true, audioUrl: true },
                })

                if (!step) {
                  const newFails = lead.failCount + 1
                  if (newFails >= 3) {
                    await prisma.remarketingLead.update({ where: { id: lead.id }, data: { status: "failed", failCount: newFails } })
                    log("🚨", `Remarketing "${campaign.name}": ${lead.number} falhou — template ${templateId} sem passos (${newFails}x)`)
                  } else {
                    await prisma.remarketingLead.update({
                      where: { id: lead.id },
                      data: { failCount: newFails, nextRun: new Date(Date.now() + 30 * 60 * 1000) },
                    })
                    log("⚠️", `Remarketing "${campaign.name}": template sem passos para ${lead.number} — retry em 30min`)
                  }
                } else {
                  const contactLike: ContactLike = { name: lead.name, phone: lead.number }
                  const phone = normalizePhone(lead.number)

                  if (!tryAcquireSendSlot(userId, campaign.rmktMinDelaySec * 1000)) {
                    log("⏳", `Remarketing "${campaign.name}": instância ${userId} enviou recentemente — adiando`)
                    continue
                  }

                  let sendError: string | null = null
                  try {
                    if (step.stepType === "image" && step.imageUrl) {
                      const caption = applyVariables(processSpintax(step.body), contactLike)
                      await sendImage(userId, phone, step.imageUrl, caption)
                      log("🖼️", `Remarketing "${campaign.name}": passo ${lead.currentStep} (img) → ${phone}`)
                    } else if (step.stepType === "audio" && step.audioUrl) {
                      await sendAudio(userId, phone, step.audioUrl)
                      log("🎙️", `Remarketing "${campaign.name}": passo ${lead.currentStep} (áudio) → ${phone}`)
                    } else if (step.stepType === "image") {
                      sendError = "image sem imageUrl"
                      log("⏩", `Remarketing "${campaign.name}": imagem sem URL — pulando ${phone}`)
                    } else if (step.stepType === "audio") {
                      sendError = "audio sem audioUrl"
                      log("⏩", `Remarketing "${campaign.name}": áudio sem arquivo — pulando ${phone}`)
                    } else {
                      const text = applyVariables(processSpintax(step.body), contactLike)
                      await sendText(userId, phone, text)
                      log("📲", `Remarketing "${campaign.name}": passo ${lead.currentStep} → ${phone}`)
                    }
                  } catch (err: unknown) {
                    sendError = errMsg(err)
                    log("❌", `Remarketing "${campaign.name}": falha → ${phone}: ${sendError}`)
                  }

                  if (sendError) {
                    const newFails = lead.failCount + 1
                    if (newFails >= 3) {
                      await prisma.remarketingLead.update({ where: { id: lead.id }, data: { status: "failed", failCount: newFails } })
                      log("🚨", `Remarketing "${campaign.name}": ${phone} marcado como failed após ${newFails} falhas`)
                    } else {
                      await prisma.remarketingLead.update({
                        where: { id: lead.id },
                        data: { failCount: newFails, nextRun: new Date(Date.now() + 30 * 60 * 1000) },
                      })
                    }
                  } else {
                    const isLastStep = lead.currentStep >= Math.min(campaign.rmktMaxFollowUps, scripts.length)
                    if (isLastStep) {
                      await prisma.remarketingLead.update({
                        where: { id: lead.id },
                        data: { status: "completed", lastSentAt: now },
                      })
                      log("✅", `Remarketing "${campaign.name}": ${phone} completou follow-up ${lead.currentStep}/${campaign.rmktMaxFollowUps}`)
                    } else {
                      await prisma.remarketingLead.update({
                        where: { id: lead.id },
                        data: {
                          currentStep: lead.currentStep + 1,
                          nextRun: new Date(Date.now() + campaign.rmktIntervalMinutes * 60 * 1000),
                          failCount: 0,
                          lastSentAt: now,
                        },
                      })
                      log("⏩", `Remarketing "${campaign.name}": ${phone} passo ${lead.currentStep + 1}, próximo em ${campaign.rmktIntervalMinutes}min`)
                    }
                  }

                  // Anti-ban: defer the next already-due lead
                  if (campaign.rmktMinDelaySec > 0) {
                    try {
                      const nextReady = await prisma.remarketingLead.findFirst({
                        where: { campaignId: campaign.id, status: "pending", nextRun: { lte: new Date() }, id: { not: lead.id } },
                        orderBy: { nextRun: "asc" },
                      })
                      if (nextReady) {
                        const delaySec = randomBetween(campaign.rmktMinDelaySec, campaign.rmktMaxDelaySec)
                        await prisma.remarketingLead.updateMany({
                          where: { id: nextReady.id },
                          data: { nextRun: new Date(Date.now() + delaySec * 1000) },
                        })
                        log("⏳", `Remarketing "${campaign.name}": próximo lead aguardando ${delaySec}s`)
                      }
                    } catch (err) {
                      log("⚠️", `Remarketing "${campaign.name}": erro ao aplicar delay anti-ban: ${errMsg(err)}`)
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          log("⚠️", `Remarketing "${campaign.name}": erro inesperado no lead ${lead.id}: ${errMsg(err)}`)
        }
      } catch (err) {
        log("⚠️", `Remarketing "${campaign.name}": erro inesperado: ${errMsg(err)}`)
      }
    }
  } finally {
    remarketingTicking = false
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const { hhmm: bootTime } = brasiliaDateParts()
console.log("╔════════════════════════════════════════════╗")
console.log("║   SenderWhats Worker  •  iniciando...      ║")
console.log("╚════════════════════════════════════════════╝")
console.log(`Banco: ${process.env.DATABASE_URL?.split("@")[1] ?? "?"}`)
console.log(`WhatsApp API: ${WHATSAPP_BASE}`)
console.log(`Horário Local: ${bootTime}`)
console.log("Tick: a cada 10 segundos\n")

tick()
cron.schedule("*/10 * * * * *", tick)

remarketingTick()
cron.schedule("*/2 * * * *", remarketingTick)
