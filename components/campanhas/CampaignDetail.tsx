"use client"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Users,
  Layers,
  Smartphone,
  RefreshCw,
  CalendarClock,
  Loader2,
  Zap,
  WifiOff,
  AlertTriangle,
  Copy,
  Trash2,
  Timer,
  TrendingUp,
  Zap as ZapIcon,
  ZapOff,
  Repeat,
  MessageCircle,
  PackageCheck,
  Eye,
} from "lucide-react"
import type { ScheduleEstimate } from "@/lib/campaign-estimate"

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED"

type Counts = {
  total: number
  pending: number
  sending: number
  sent: number
  failed: number
  completed: number
  delivered: number
  read: number
  replied: number
  repliedViaRemarketing: number
}

type QueueMessage = {
  id: string
  status: "PENDING"
  currentStep: number
  nextSendAt: string | null
  contact: { phone: string; name: string | null }
}

type SentMessage = {
  id: string
  status: "SENDING" | "SENT" | "COMPLETED"
  currentStep: number
  sentAt: string | null
  nextSendAt: string | null
  contact: { phone: string; name: string | null }
}

type FailedMessage = {
  id: string
  currentStep: number
  sentAt: string | null
  failureReason: string | null
  failureCategory: string | null
  contact: { phone: string; name: string | null }
}

type NextPending = {
  id: string
  nextSendAt: string | null
  contact: { phone: string; name: string | null }
} | null

type ScheduleRule = {
  dayOfWeek: number
  startTime: string
  endTime: string
  maxContacts: number | null
  maxContactsPeriod: string
}

type CampaignData = {
  id: string
  name: string
  status: CampaignStatus
  scheduledAt: string | null
  minDelay: number
  maxDelay: number
  maxSendsPerDay: number
  forceDispatch: boolean
  enableRemarketing: boolean
  rmktScripts: { templateId: string }[]
  rmktIntervalMinutes: number
  rmktWindowStart: string
  rmktWindowEnd: string
  rmktAllowedDays: string
  rmktMaxPerDay: number
  rmktPaused: boolean
  scheduleRules: ScheduleRule[]
  vendedor: { nome: string; userId: string }
  list: { name: string; _count: { items: number } } | null
  template: { name: string; _count: { steps: number } } | null
  _counts: Counts
  estimate: ScheduleEstimate | null
  queueMessages: QueueMessage[]
  sentMessages: SentMessage[]
  failedMessages: FailedMessage[]
  nextPending: NextPending
  vendedorRunningCampaigns?: { id: string; name: string }[]
}

type Tab = "queue" | "sent" | "failed"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<CampaignStatus, { label: string; text: string; dot: string; pulse?: boolean }> = {
  DRAFT:     { label: "Rascunho",  text: "text-slate-500",                         dot: "bg-slate-500" },
  SCHEDULED: { label: "Agendado",  text: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500" },
  RUNNING:   { label: "Rodando",   text: "text-violet-600 dark:text-violet-400",   dot: "bg-violet-500", pulse: true },
  PAUSED:    { label: "Pausado",   text: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-400" },
  COMPLETED: { label: "Concluído", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  FAILED:    { label: "Falhou",    text: "text-rose-600 dark:text-rose-400",       dot: "bg-rose-500" },
}

function fmtSec(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}min`
}

function fmtPhone(phone: string): string {
  const d = phone.replace(/\D/g, "")
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 5)} ${d.slice(5, 9)}-${d.slice(9)}`
  }
  return `+${d}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return "--"
  const date = new Date(iso)
  const dateStr = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  const timeStr = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  return `${dateStr} às ${timeStr}`
}

function fmtCountdown(s: number): string {
  if (s <= 0) return "0s"
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r > 0 ? `${m}min ${r}s` : `${m}min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}min` : `${h}h`
}

function fmtHours(sec: number): string {
  if (sec <= 0) return "0h"
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function fmtEstimateDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (d.toDateString() === now.toDateString()) return `Hoje às ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Amanhã às ${time}`
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")
  const dt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
  return `${wd} ${dt} às ${time}`
}

function fmtInterval(minutes: number): string {
  if (minutes >= 10080 && minutes % 10080 === 0) {
    const n = minutes / 10080
    return `a cada ${n === 1 ? "1 semana" : `${n} semanas`}`
  }
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const n = minutes / 1440
    return `a cada ${n === 1 ? "1 dia" : `${n} dias`}`
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const n = minutes / 60
    return `a cada ${n === 1 ? "1 hora" : `${n} horas`}`
  }
  return `a cada ${minutes}min`
}

const DAY_LABELS: Record<string, string> = {
  "1": "Seg", "2": "Ter", "3": "Qua", "4": "Qui", "5": "Sex", "6": "Sáb", "7": "Dom",
}

function fmtAllowedDays(csv: string): string {
  return csv.split(",").filter(Boolean).map((d) => DAY_LABELS[d] ?? d).join(", ")
}

function parseFailureReason(raw: string | null): string {
  if (!raw) return "Erro desconhecido"
  // Strip transient retry counter prefix added by the worker ("[t:N] ...")
  const clean = raw.replace(/^\[t:\d+\]\s*/, "")
  try {
    const jsonStart = clean.indexOf("{")
    if (jsonStart >= 0) {
      const parsed = JSON.parse(clean.slice(jsonStart)) as { message?: string; details?: string }
      if (typeof parsed.details === "string") return parsed.details.slice(0, 120)
      if (typeof parsed.message === "string") return parsed.message
    }
  } catch {}
  return clean.length > 120 ? clean.slice(0, 117) + "…" : clean
}

// ─── Hook: live countdown ─────────────────────────────────────────────────────

function useCountdown(isoDate: string | null): number | null {
  const [secs, setSecs] = useState<number | null>(null)
  useEffect(() => {
    if (!isoDate) { setSecs(null); return }
    const target = new Date(isoDate).getTime()
    const update = () => setSecs(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [isoDate])
  return secs
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ progress, status }: { progress: number; status: CampaignStatus }) {
  const r = 50
  const stroke = 8
  const nr = r - stroke / 2
  const circ = 2 * Math.PI * nr
  const offset = circ * (1 - progress / 100)

  const color = status === "COMPLETED" ? "#10b981" : status === "FAILED" ? "#f43f5e" : "#8b5cf6"

  return (
    <svg width={r * 2} height={r * 2} className="rotate-[-90deg]">
      <circle cx={r} cy={r} r={nr} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-200 dark:text-white/5" />
      <circle
        cx={r}
        cy={r}
        r={nr}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.3s ease" }}
      />
    </svg>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 flex flex-col gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value.toLocaleString()}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
      <Icon className="w-8 h-8 text-slate-300 dark:text-slate-700" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-600">{subtitle}</p>
    </div>
  )
}

// ─── Queue Row ────────────────────────────────────────────────────────────────

function QueueRow({ msg, onRemove }: { msg: QueueMessage; onRemove: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const secs = useCountdown(msg.nextSendAt)
  // secs > 0  → anti-ban delay active (waiting)
  // secs == 0 → nextSendAt is past → ready to be dispatched
  // secs null → no nextSendAt set → ready
  const isDelayed = secs !== null && secs > 0

  const handleRemove = async () => {
    setRemoving(true)
    await onRemove(msg.id)
    setRemoving(false)
    setConfirming(false)
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0 group/qrow">
      <Clock className={`w-4 h-4 shrink-0 ${isDelayed ? "text-amber-400" : "text-slate-400 dark:text-slate-600"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-900 dark:text-white">
          <span className="font-medium">{msg.contact.name ?? fmtPhone(msg.contact.phone)}</span>
          {" · "}
          <span className="font-mono text-[10px] text-slate-500">{fmtPhone(msg.contact.phone)}</span>
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {isDelayed ? "Aguardando delay anti-ban" : "Aguardando envio"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[10px] font-mono ${isDelayed ? "font-semibold text-amber-500" : "text-slate-400 dark:text-slate-600"}`}>
          {isDelayed ? fmtCountdown(secs!) : "Na fila"}
        </span>
        <AnimatePresence mode="wait">
          {confirming ? (
            <motion.div key="confirm" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-1">
              <button onClick={() => setConfirming(false)} className="text-[10px] px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-200 transition-colors">✕</button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors disabled:opacity-50"
              >
                {removing ? "..." : "Remover"}
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="trash"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setConfirming(true)}
              className="p-1 rounded-lg text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover/qrow:opacity-100"
              title="Remover da fila"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Sent Row ─────────────────────────────────────────────────────────────────

function SentRow({ msg }: { msg: SentMessage }) {
  const isSending = msg.status === "SENDING"
  const secs = useCountdown(isSending ? (msg.nextSendAt ?? null) : null)

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
      {isSending ? (
        <Loader2 className="w-4 h-4 text-violet-400 shrink-0 animate-spin" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-900 dark:text-white">
          <span className="font-medium">{msg.contact.name ?? fmtPhone(msg.contact.phone)}</span>
          {" · "}
          <span className="font-mono text-[10px] text-slate-500">{fmtPhone(msg.contact.phone)}</span>
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {isSending
            ? `Passo ${msg.currentStep - 1} enviado · aguardando passo ${msg.currentStep}`
            : "Enviado com sucesso"}
        </p>
      </div>
      <div className="text-right shrink-0">
        {isSending && secs !== null && secs > 0 ? (
          <span className="text-[10px] font-mono font-semibold text-violet-400">
            {fmtCountdown(secs)}
          </span>
        ) : msg.sentAt ? (
          <span className="text-[10px] text-slate-400 dark:text-slate-700">
            {fmtTime(msg.sentAt)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ─── Failed Row ───────────────────────────────────────────────────────────────

const FAILURE_CATEGORY_CFG: Record<string, { label: string; cls: string }> = {
  no_whatsapp:   { label: "Sem WhatsApp",   cls: "bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  session_error: { label: "Sessão perdida", cls: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  timeout:       { label: "Timeout",        cls: "bg-slate-100 dark:bg-white/5 text-slate-500" },
  transient:     { label: "Retentando",     cls: "bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  unknown:       { label: "Erro",           cls: "bg-rose-100 dark:bg-rose-500/10 text-rose-500" },
}

function parseTransientAttempt(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.match(/^\[t:(\d+)\]/)
  return m ? parseInt(m[1]!, 10) : null
}

function FailedRow({ msg }: { msg: FailedMessage }) {
  const catCfg = msg.failureCategory ? (FAILURE_CATEGORY_CFG[msg.failureCategory] ?? FAILURE_CATEGORY_CFG.unknown) : null
  const transientAttempt = parseTransientAttempt(msg.failureReason)

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs text-slate-900 dark:text-white">
            <span className="font-medium">{msg.contact.name ?? fmtPhone(msg.contact.phone)}</span>
            {" · "}
            <span className="font-mono text-[10px] text-slate-500">{fmtPhone(msg.contact.phone)}</span>
          </p>
          {catCfg && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${catCfg.cls}`}>
              {catCfg.label}
              {transientAttempt !== null && ` ${transientAttempt}/3`}
            </span>
          )}
        </div>
        <p className="text-[10px] text-rose-400/80 mt-0.5 leading-relaxed">
          {parseFailureReason(msg.failureReason)}
        </p>
      </div>
      {msg.sentAt && (
        <span className="text-[10px] text-slate-400 dark:text-slate-700 shrink-0 mt-0.5">
          {fmtTime(msg.sentAt)}
        </span>
      )}
    </div>
  )
}

// ─── Next Send Card ───────────────────────────────────────────────────────────

function NextSendCard({
  nextPending,
  activeSending,
  onSkip,
}: {
  nextPending: NextPending
  activeSending: SentMessage | null
  onSkip: (messageId: string) => Promise<void>
}) {
  const [secs, setSecs] = useState<number | null>(null)
  const [skipping, setSkipping] = useState(false)
  const totalRef = useRef<number | null>(null)

  useEffect(() => {
    if (!nextPending?.nextSendAt) {
      setSecs(null)
      totalRef.current = null
      return
    }
    const target = new Date(nextPending.nextSendAt).getTime()
    const update = () => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
      if (totalRef.current === null) totalRef.current = remaining
      setSecs(remaining)
    }
    update()
    const id = setInterval(update, 1000)
    return () => { clearInterval(id); totalRef.current = null }
  }, [nextPending?.nextSendAt])

  // Mid-sequence state: a lead is actively sending its script steps
  if (!nextPending && activeSending) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/[0.07] p-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide">
              Enviando sequência · passo {activeSending.currentStep - 1}
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
              {activeSending.contact.name ?? fmtPhone(activeSending.contact.phone)}
            </p>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
              {fmtPhone(activeSending.contact.phone)}
            </p>
          </div>
          <span className="text-sm font-bold text-blue-500 animate-pulse shrink-0">
            Em andamento
          </span>
        </div>
      </motion.div>
    )
  }

  if (!nextPending) return null

  const isFiring = secs !== null && secs <= 0
  const pct =
    totalRef.current && secs !== null && totalRef.current > 0
      ? Math.round((secs / totalRef.current) * 100)
      : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/[0.07] p-5"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
          {isFiring ? (
            <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
          ) : (
            <CalendarClock className="w-5 h-5 text-violet-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 uppercase tracking-wide">
            {isFiring ? "Enviando agora..." : "Próximo contato da fila"}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
            {nextPending.contact.name ?? fmtPhone(nextPending.contact.phone)}
          </p>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
            {fmtPhone(nextPending.contact.phone)}
          </p>
        </div>

        <div className="text-right shrink-0">
          {isFiring ? (
            <span className="text-sm font-bold text-violet-500 animate-pulse">
              Disparando...
            </span>
          ) : secs !== null ? (
            <>
              <p className="text-2xl font-bold tabular-nums leading-none text-violet-600 dark:text-violet-400">
                {fmtCountdown(secs)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
                até o envio
              </p>
            </>
          ) : (
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
          )}
        </div>
      </div>

      {!isFiring && secs !== null && secs > 0 && (
        <div className="mt-4 space-y-2">
          <div className="h-1.5 rounded-full bg-violet-100 dark:bg-violet-500/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-400 dark:text-slate-700">
              aguardando anti-ban · {fmtCountdown(secs)} restantes
            </span>
            <button
              onClick={async () => {
                if (!nextPending || skipping) return
                setSkipping(true)
                try { await onSkip(nextPending.id) }
                finally { setSkipping(false) }
              }}
              disabled={skipping}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-violet-100 dark:bg-violet-500/15 hover:bg-violet-200 dark:hover:bg-violet-500/25 text-violet-600 dark:text-violet-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {skipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {skipping ? "Enviando..." : "Pular Delay"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── Tabbed Log Panel ─────────────────────────────────────────────────────────

const TAB_CFG = [
  {
    key: "queue" as Tab,
    label: "Fila",
    activeText:   "text-amber-600 dark:text-amber-400",
    activeBorder: "border-amber-500",
    activeBadge:  "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400",
    inactiveBadge:"bg-slate-100 dark:bg-white/5 text-slate-500",
  },
  {
    key: "sent" as Tab,
    label: "Enviados",
    activeText:   "text-emerald-600 dark:text-emerald-400",
    activeBorder: "border-emerald-500",
    activeBadge:  "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    inactiveBadge:"bg-slate-100 dark:bg-white/5 text-slate-500",
  },
  {
    key: "failed" as Tab,
    label: "Falhas",
    activeText:   "text-rose-600 dark:text-rose-400",
    activeBorder: "border-rose-500",
    activeBadge:  "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400",
    inactiveBadge:"bg-slate-100 dark:bg-white/5 text-slate-500",
  },
] as const

function TabbedLogPanel({
  data,
  counts,
  isRunning,
  activeTab,
  onTabChange,
  onRemoveFromQueue,
}: {
  data: CampaignData
  counts: Counts
  isRunning: boolean
  activeTab: Tab
  onTabChange: (t: Tab) => void
  onRemoveFromQueue: (id: string) => void
}) {
  const tabCounts: Record<Tab, number> = {
    queue:  counts.pending,
    sent:   counts.sending + counts.sent + counts.completed,
    failed: counts.failed,
  }

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] flex flex-col overflow-hidden"
      style={{ maxHeight: 460 }}
    >
      {/* Tab header */}
      <div className="px-5 pt-0 border-b border-slate-100 dark:border-white/[0.04] flex items-center gap-2">
        <div className="flex flex-1 gap-0">
          {TAB_CFG.map((tab) => {
            const isActive = activeTab === tab.key
            const count = tabCounts[tab.key]
            const hasFatalFailure = tab.key === "failed" && count > 0 && !isRunning

            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-3.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  isActive
                    ? `${tab.activeText} ${tab.activeBorder}`
                    : "text-slate-500 dark:text-slate-600 border-transparent hover:text-slate-700 dark:hover:text-slate-400"
                }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isActive ? tab.activeBadge : tab.inactiveBadge} ${hasFatalFailure ? "animate-pulse" : ""}`}>
                  {count.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>

        {isRunning && (
          <span className="flex items-center gap-1.5 text-[10px] text-violet-400 shrink-0 pb-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-violet-500 opacity-75" />
              <span className="relative rounded-full h-1.5 w-1.5 bg-violet-500" />
            </span>
            Ao vivo
          </span>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-5">
        {/* ── Queue ── */}
        {activeTab === "queue" && (
          data.queueMessages.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Fila vazia"
              subtitle="Nenhum lead aguardando início. Verifique a aba Enviados."
            />
          ) : (
            <>
              {data.queueMessages.map((msg) => (
                <QueueRow key={msg.id} msg={msg} onRemove={onRemoveFromQueue} />
              ))}
              {tabCounts.queue > data.queueMessages.length && (
                <p className="text-[10px] text-slate-400 dark:text-slate-700 py-3 text-center">
                  Mostrando {data.queueMessages.length} de {tabCounts.queue.toLocaleString()} contatos na fila
                </p>
              )}
            </>
          )
        )}

        {/* ── Sent ── */}
        {activeTab === "sent" && (
          data.sentMessages.length === 0 ? (
            <EmptyState
              icon={Send}
              title="Nenhuma mensagem enviada ainda"
              subtitle="Aguardando o worker processar o primeiro lead da fila."
            />
          ) : (
            <>
              {data.sentMessages.map((msg) => (
                <SentRow key={msg.id} msg={msg} />
              ))}
              {tabCounts.sent > data.sentMessages.length && (
                <p className="text-[10px] text-slate-400 dark:text-slate-700 py-3 text-center">
                  Mostrando os {data.sentMessages.length} mais recentes de {tabCounts.sent.toLocaleString()} enviados
                </p>
              )}
            </>
          )
        )}

        {/* ── Failed ── */}
        {activeTab === "failed" && (
          data.failedMessages.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Sem falhas registradas"
              subtitle="Ótimo! Nenhum envio falhou até o momento."
            />
          ) : (
            <>
              {data.failedMessages.map((msg) => (
                <FailedRow key={msg.id} msg={msg} />
              ))}
              {tabCounts.failed > data.failedMessages.length && (
                <p className="text-[10px] text-slate-400 dark:text-slate-700 py-3 text-center">
                  Mostrando {data.failedMessages.length} de {tabCounts.failed.toLocaleString()} falhas
                </p>
              )}
            </>
          )
        )}
      </div>
    </div>
  )
}

// ─── Schedule Window Banner ───────────────────────────────────────────────────

function ScheduleWindowBanner({
  nextWindowStart,
  nextWindowStartTime,
  forced,
}: {
  nextWindowStart: string
  nextWindowStartTime: string | null
  forced: boolean
}) {
  const secsToNext = useCountdown(forced ? null : nextWindowStart)
  const d = new Date(nextWindowStart)
  const label = (() => {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    // Usa o startTime da regra diretamente — sem conversão de timezone
    const time = nextWindowStartTime ?? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    if (d.toDateString() === now.toDateString()) return `hoje às ${time}`
    if (d.toDateString() === tomorrow.toDateString()) return `amanhã às ${time}`
    const wd = d.toLocaleDateString("pt-BR", { weekday: "long" })
    return `${wd} às ${time}`
  })()

  if (forced) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 text-sm"
      >
        <ZapIcon className="w-4 h-4 shrink-0" />
        <span className="font-medium flex-1 min-w-0">
          Disparando fora da janela (modo forçado) — a janela normal retomaria {label}
        </span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm"
    >
      <CalendarClock className="w-4 h-4 shrink-0" />
      <span className="font-medium flex-1 min-w-0">
        Fora da janela de envio — retoma {label}
      </span>
      {secsToNext !== null && secsToNext > 0 && (
        <span className="text-xs font-bold font-mono shrink-0 tabular-nums">
          {fmtCountdown(secsToNext)}
        </span>
      )}
    </motion.div>
  )
}

// ─── Estimate Panel ───────────────────────────────────────────────────────────

function EstimatePanel({ estimate, pending }: { estimate: ScheduleEstimate; pending: number }) {
  const finishSecs = useCountdown(estimate.estimatedFinishAt)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-violet-500 dark:text-violet-400" />
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Estimativas de Conclusão</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Delay médio */}
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-600 uppercase tracking-wide">Delay médio</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{fmtSec(estimate.avgDelaySeconds)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">entre disparos</p>
        </div>

        {/* Janela por dia */}
        {estimate.windowSecondsPerDay < 86400 && (
          <div>
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-600 uppercase tracking-wide">Janela/dia</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{fmtHours(estimate.windowSecondsPerDay)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">de envio ativo</p>
          </div>
        )}

        {/* Leads por dia */}
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-600 uppercase tracking-wide">Leads/dia</p>
          {estimate.leadsPerDay > 0 ? (
            <>
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                ~{estimate.leadsPerDay.toLocaleString("pt-BR")}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">{pending.toLocaleString("pt-BR")} na fila</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-rose-500 mt-0.5">—</p>
              <p className="text-[10px] text-rose-400 mt-0.5">janela menor que o delay</p>
            </>
          )}
        </div>

        {/* Conclusão estimada */}
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-600 uppercase tracking-wide">Conclusão</p>
          {estimate.estimatedFinishAt && estimate.leadsPerDay > 0 ? (
            <>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">
                {fmtEstimateDate(estimate.estimatedFinishAt)}
              </p>
              <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {estimate.workingDaysRemaining <= 1
                  ? "hoje"
                  : `~${estimate.workingDaysRemaining} dias`}
                {finishSecs !== null && finishSecs > 0 && finishSecs < 86400 && (
                  <span className="font-mono">{fmtCountdown(finishSecs)}</span>
                )}
              </div>
            </>
          ) : (
            <p className="text-lg font-bold text-slate-400 mt-0.5">—</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Next Remarketing Card ────────────────────────────────────────────────────

function NextRmktCard({ lead }: { lead: RmktLead }) {
  const secs = useCountdown(lead.nextRun)
  const isFiring = secs !== null && secs <= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="rounded-xl border border-teal-200 dark:border-teal-500/20 bg-teal-50 dark:bg-teal-500/[0.07] p-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
          {isFiring ? (
            <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
          ) : (
            <Repeat className="w-4 h-4 text-teal-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-teal-500 dark:text-teal-400 uppercase tracking-wide">
            {isFiring ? "Enviando follow-up..." : `Próximo follow-up · ${lead.currentStep}º passo`}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
            {lead.name ?? fmtPhone(lead.number)}
          </p>
          <p className="text-[10px] font-mono text-slate-400 mt-0.5">
            {fmtPhone(lead.number)}
          </p>
        </div>
        <div className="text-right shrink-0">
          {isFiring ? (
            <span className="text-sm font-bold text-teal-500 animate-pulse">Disparando...</span>
          ) : secs !== null && secs > 0 ? (
            <>
              <p className="text-xl font-bold tabular-nums leading-none text-teal-600 dark:text-teal-400">
                {fmtCountdown(secs)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">até o envio</p>
            </>
          ) : (
            <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Remarketing Section ──────────────────────────────────────────────────────

type RmktLead = {
  id: string
  number: string
  name: string | null
  currentStep: number
  nextRun: string
  status: string
  replied: boolean
  failCount: number
  lastSentAt: string | null
}

const RMKT_STATUS: Record<string, { label: string; cls: string }> = {
  pending:       { label: "Aguardando",  cls: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" },
  completed:     { label: "Concluído",   cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
  failed:        { label: "Falhou",      cls: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10" },
  stop_by_admin: { label: "Parado",      cls: "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5" },
}

type RmktConfig = {
  scripts: { templateId: string }[]
  intervalMinutes: number
  windowStart: string
  windowEnd: string
  allowedDays: string
  maxPerDay: number
  paused: boolean
}

function RemarketingSection({
  campaignId,
  isRunning,
  config,
  onPauseToggle,
}: {
  campaignId: string
  isRunning: boolean
  config: RmktConfig
  onPauseToggle: () => void
}) {
  const [leads, setLeads] = useState<RmktLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)
  const [resumeNotice, setResumeNotice] = useState<{ count: number } | null>(null)
  const resumeNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (resumeNoticeTimerRef.current) clearTimeout(resumeNoticeTimerRef.current)
  }, [])

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/remarketing-leads`, { cache: "no-store" })
      if (res.ok) {
        setLeads(await res.json() as RmktLead[])
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  useEffect(() => {
    if (!isRunning) return
    const id = setInterval(fetchLeads, 30_000)
    return () => clearInterval(id)
  }, [isRunning, fetchLeads])

  const handlePauseToggle = async () => {
    setTogglingPause(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/remarketing-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !config.paused }),
      })
      if (res.ok) {
        const data = await res.json() as { paused: boolean; overdueCount: number }
        if (!data.paused && data.overdueCount > 0) {
          setResumeNotice({ count: data.overdueCount })
          if (resumeNoticeTimerRef.current) clearTimeout(resumeNoticeTimerRef.current)
          resumeNoticeTimerRef.current = setTimeout(() => setResumeNotice(null), 10_000)
        }
        onPauseToggle()
      }
    } finally {
      setTogglingPause(false)
    }
  }

  const pending = useMemo(() => leads.filter((l) => l.status === "pending").length, [leads])
  const replied = useMemo(() => leads.filter((l) => l.replied).length, [leads])
  // Leads já vêm ordenados por nextRun asc da API — o primeiro pending é o próximo a disparar
  const nextPendingLead = useMemo(() => leads.find((l) => l.status === "pending") ?? null, [leads])

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.04] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Repeat className={`w-4 h-4 ${config.paused ? "text-amber-400" : "text-violet-500"}`} />
            <span className="font-semibold text-sm text-slate-900 dark:text-white">Follow-up automático</span>
            {config.paused && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Pausado
              </span>
            )}
            {leads.length > 0 && (
              <span className="text-xs text-slate-400">({leads.length} contato{leads.length !== 1 ? "s" : ""})</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pending > 0 && !config.paused && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {pending} aguardando
              </span>
            )}
            {replied > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <MessageCircle className="w-3 h-3" />
                {replied} responderam
              </span>
            )}
            {/* Pause / Resume toggle */}
            <button
              onClick={handlePauseToggle}
              disabled={togglingPause}
              title={config.paused ? "Retomar follow-up" : "Pausar follow-up"}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                config.paused
                  ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                  : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20"
              }`}
            >
              {togglingPause
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : config.paused
                  ? <Play className="w-3 h-3" />
                  : <Pause className="w-3 h-3" />
              }
              {config.paused ? "Retomar" : "Pausar"}
            </button>
            <button
              onClick={fetchLeads}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Resume notice — shown briefly after unpausing when there are overdue leads */}
        <AnimatePresence>
          {resumeNotice && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/15"
            >
              <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-px" />
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                Follow-up retomado. <span className="font-semibold">{resumeNotice.count} lead{resumeNotice.count !== 1 ? "s" : ""} aguardando</span> — estes serão enviados primeiro.
                {config.maxPerDay > 0
                  ? ` Limite de ${config.maxPerDay}/dia aplicado.`
                  : " Configure máx/dia para distribuir o backlog."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Config summary chips */}
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            {config.scripts.length} script{config.scripts.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            {fmtInterval(config.intervalMinutes)}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            {config.windowStart}–{config.windowEnd}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            {fmtAllowedDays(config.allowedDays)}
          </span>
          {config.maxPerDay > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
              máx {config.maxPerDay}/dia
            </span>
          )}
        </div>
      </div>

      {/* Next remarketing dispatch countdown */}
      <AnimatePresence>
        {!loading && !error && nextPendingLead && (
          <div className="px-5 pt-4">
            <NextRmktCard lead={nextPendingLead} />
          </div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="py-10 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <p className="text-sm text-rose-500">Erro ao carregar follow-ups.</p>
          <button onClick={fetchLeads} className="mt-2 text-[11px] text-violet-500 hover:underline">Tentar novamente</button>
        </div>
      ) : leads.length === 0 ? (
        <div className="py-10 text-center">
          <Repeat className="w-6 h-6 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Nenhum contato em follow-up ainda.</p>
          <p className="text-[11px] text-slate-400 mt-1">Os contatos aparecerão aqui quando um envio for concluído.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-white/[0.04]">
                <th className="text-left px-5 py-3">Contato</th>
                <th className="text-left px-5 py-3">Passo</th>
                <th className="text-left px-5 py-3 hidden sm:table-cell">Próximo envio</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3 hidden md:table-cell">Resposta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
              {leads.map((lead) => {
                const s = RMKT_STATUS[lead.status] ?? { label: lead.status, cls: "text-slate-400 bg-slate-100" }
                const isPast = lead.status === "pending" && new Date(lead.nextRun) <= new Date()
                return (
                  <tr key={lead.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-xs font-medium text-slate-900 dark:text-white">
                        {lead.name ?? fmtPhone(lead.number)}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">{fmtPhone(lead.number)}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {lead.currentStep}º follow-up
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={`text-xs ${isPast ? "text-violet-500 dark:text-violet-400 font-semibold" : "text-slate-400"}`}>
                        {isPast ? "Enviando em breve..." : fmtTime(lead.nextRun)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      {lead.replied ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <MessageCircle className="w-3 h-3" />
                          Respondeu
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CampaignDetail({ initial }: { initial: CampaignData }) {
  const router = useRouter()
  const [data, setData] = useState<CampaignData>(initial)
  const [actioning, setActioning] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [forcingDispatch, setForcingDispatch] = useState(false)
  const [sendTargetModal, setSendTargetModal] = useState<"START" | "RESUME" | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<"pending" | "all" | "sent_only">("pending")
  const [skippedDuplicatesNotice, setSkippedDuplicatesNotice] = useState<number | null>(null)
  const [confirmRunningModal, setConfirmRunningModal] = useState(false)

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/campaigns/${initial.id}/duplicate`, { method: "POST" })
      if (!res.ok) return
      const { id: newId } = await res.json() as { id: string }
      router.push(`/campanhas/${newId}/editar`)
    } finally {
      setDuplicating(false)
    }
  }
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [instanceState, setInstanceState] = useState<"open" | "close" | "connecting" | "unknown">("unknown")
  const [activeTab, setActiveTab] = useState<Tab>("queue")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const instancePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [statusToast, setStatusToast] = useState<{ type: "force_off" | "disconnected"; key: number } | null>(null)
  const prevForceDispatch = useRef<boolean | null>(null)
  const prevInstanceState = useRef<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${initial.id}`, { cache: "no-store" })
      if (res.ok) {
        const updated: CampaignData = await res.json()
        setData(updated)
        setLastRefresh(Date.now())
      }
    } catch {}
  }, [initial.id])

  // Poll campaign data every 5s while RUNNING
  useEffect(() => {
    if (data.status === "RUNNING") {
      intervalRef.current = setInterval(fetchData, 5000)
    }
    return () => { clearInterval(intervalRef.current!) }
  }, [data.status, fetchData])

  // Auto-switch tab when campaign completes or fails
  useEffect(() => {
    if (data.status === "COMPLETED") setActiveTab("sent")
    else if (data.status === "FAILED" || (data.status === "PAUSED" && data._counts.failed > 0)) setActiveTab("failed")
  }, [data.status, data._counts.failed])

  // Poll WhatsApp instance health every 15s
  useEffect(() => {
    const userId = data.vendedor.userId
    const check = async () => {
      try {
        const res = await fetch(`/api/instances/${userId}/status`, { cache: "no-store" })
        if (!res.ok) return
        const d = (await res.json()) as { state?: string }
        setInstanceState((d.state as "open" | "close" | "connecting") ?? "unknown")
      } catch {}
    }
    check()
    instancePollRef.current = setInterval(check, 15000)
    return () => { clearInterval(instancePollRef.current!) }
  }, [data.vendedor.userId])

  // Toast: detect forceDispatch going true → false
  useEffect(() => {
    if (prevForceDispatch.current === true && data.forceDispatch === false) {
      setStatusToast({ type: "force_off", key: Date.now() })
    }
    prevForceDispatch.current = data.forceDispatch
  }, [data.forceDispatch])

  // Toast: detect instance going open → close
  useEffect(() => {
    if (prevInstanceState.current === "open" && instanceState === "close") {
      setStatusToast({ type: "disconnected", key: Date.now() })
    }
    prevInstanceState.current = instanceState
  }, [instanceState])

  // Auto-dismiss toast after 4.5s
  useEffect(() => {
    if (!statusToast) return
    const id = setTimeout(() => setStatusToast(null), 4500)
    return () => clearTimeout(id)
  }, [statusToast?.key])

  // Auto-dismiss duplicates notice after 8s
  useEffect(() => {
    if (!skippedDuplicatesNotice) return
    const id = setTimeout(() => setSkippedDuplicatesNotice(null), 8000)
    return () => clearTimeout(id)
  }, [skippedDuplicatesNotice])

  const sendNow = useCallback(async (messageId: string) => {
    await fetch(`/api/campaign-messages/${messageId}/send-now`, { method: "POST" })
    await fetchData()
  }, [fetchData])

  const removeFromQueue = useCallback(async (messageId: string) => {
    await fetch(`/api/campaign-messages/${messageId}/remove`, { method: "POST" })
    await fetchData()
  }, [fetchData])

  const handleForceDispatch = async () => {
    setForcingDispatch(true)
    try {
      const res = await fetch(`/api/campaigns/${initial.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "FORCE_DISPATCH" }),
      })
      if (res.ok) await fetchData()
    } finally {
      setForcingDispatch(false)
    }
  }

  const callAction = async (
    action: "START" | "PAUSE" | "RESUME",
    target?: "pending" | "all" | "sent_only"
  ) => {
    setActioning(true)
    try {
      const res = await fetch(`/api/campaigns/${initial.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(target ? { target } : {}) }),
      })
      if (res.ok) {
        const body = await res.json() as { ok?: boolean; skippedDuplicates?: number }
        if (body.skippedDuplicates && body.skippedDuplicates > 0) {
          setSkippedDuplicatesNotice(body.skippedDuplicates)
        }
        await fetchData()
      }
    } finally {
      setActioning(false)
    }
  }

  const { _counts: counts, status } = data
  const done = counts.sending + counts.sent + counts.completed + counts.failed
  const progress = counts.total > 0 ? Math.round((done / counts.total) * 100) : 0
  const cfg = STATUS_CFG[status]

  const isRunning = status === "RUNNING"
  const isPaused = status === "PAUSED"
  const isDraft = status === "DRAFT"

  const proceedStartOrResume = (actionType: "START" | "RESUME") => {
    const alreadySent = counts.sent + counts.completed
    if (alreadySent > 0) {
      setSelectedTarget("pending")
      setSendTargetModal(actionType)
    } else {
      callAction(actionType)
    }
  }

  const handleStartOrResume = () => {
    const actionType: "START" | "RESUME" = isPaused ? "RESUME" : "START"
    // Só avisa sobre campanhas concorrentes ao INICIAR (não ao retomar)
    if (actionType === "START" && (data.vendedorRunningCampaigns ?? []).length > 0) {
      setConfirmRunningModal(true)
      return
    }
    proceedStartOrResume(actionType)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* ── Status Toast (transient, fixed top-right) ──────────────────────── */}
      <AnimatePresence>
        {statusToast && (
          <motion.div
            key={statusToast.key}
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium max-w-sm ${
              statusToast.type === "disconnected"
                ? "bg-rose-50 dark:bg-[#1a0a0a] border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400"
                : "bg-amber-50 dark:bg-[#1a1200] border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400"
            }`}
          >
            {statusToast.type === "disconnected"
              ? <WifiOff className="w-4 h-4 shrink-0" />
              : <ZapOff className="w-4 h-4 shrink-0" />}
            <span>
              {statusToast.type === "disconnected"
                ? "Instância desconectada — disparos pausados"
                : "Forçamento desligado — aguardando janela"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Duplicates skipped notice ───────────────────────────────────── */}
      <AnimatePresence>
        {skippedDuplicatesNotice !== null && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className="fixed top-5 right-5 z-[100] flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium max-w-sm bg-amber-50 dark:bg-[#1a1200] border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>{skippedDuplicatesNotice}</strong> contato{skippedDuplicatesNotice !== 1 ? "s" : ""} já recebeu{skippedDuplicatesNotice !== 1 ? "ram" : ""} mensagem anterior e {skippedDuplicatesNotice !== 1 ? "foram pulados" : "foi pulado"}.
              Use <em>Enviar para todos</em> para incluí-los.
            </span>
            <button onClick={() => setSkippedDuplicatesNotice(null)} className="ml-auto shrink-0 opacity-60 hover:opacity-100">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── Send Target Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {sendTargetModal && (
          <motion.div
            key="send-target-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setSendTargetModal(null) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/[0.08] p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Para quem deseja enviar?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Esta campanha tem{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{(counts.sent + counts.completed).toLocaleString("pt-BR")} já disparados</span>
                {" "}e{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{counts.pending.toLocaleString("pt-BR")} na fila</span>.
              </p>

              <div className="mt-4 space-y-2">
                {(["pending", "all", "sent_only"] as const).map((opt) => {
                  const cfg = {
                    pending: {
                      label: "Apenas não enviados",
                      tag: "(recomendado)",
                      desc: `${counts.pending.toLocaleString("pt-BR")} contatos aguardando na fila`,
                      count: counts.pending,
                    },
                    all: {
                      label: "Todos",
                      tag: "",
                      desc: `Reenvia para todos os ${counts.total.toLocaleString("pt-BR")} contatos`,
                      count: counts.total,
                    },
                    sent_only: {
                      label: "Apenas já enviados",
                      tag: "",
                      desc: `Reenvia para ${(counts.sent + counts.completed).toLocaleString("pt-BR")} que já receberam`,
                      count: counts.sent + counts.completed,
                    },
                  }[opt]
                  const isSelected = selectedTarget === opt
                  return (
                    <button
                      key={opt}
                      onClick={() => setSelectedTarget(opt)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? "border-violet-400 dark:border-violet-500 bg-violet-50 dark:bg-violet-500/10"
                          : "border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-semibold ${isSelected ? "text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-300"}`}>
                          {cfg.label}
                          {cfg.tag && <span className="ml-1.5 text-[10px] font-normal opacity-50">{cfg.tag}</span>}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${isSelected ? "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400" : "bg-slate-100 dark:bg-white/5 text-slate-500"}`}>
                          {cfg.count.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{cfg.desc}</p>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setSendTargetModal(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-white/[0.06] text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const action = sendTargetModal
                    const target = selectedTarget === "pending" ? undefined : selectedTarget
                    setSendTargetModal(null)
                    callAction(action, target)
                  }}
                  disabled={actioning}
                  className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {sendTargetModal === "RESUME" ? "Retomar" : "Iniciar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm start with running campaign ──────────────────────────── */}
      <AnimatePresence>
        {confirmRunningModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setConfirmRunningModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.07] shadow-2xl p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Campanha já ativa</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    O vendedor <span className="font-medium text-slate-700 dark:text-slate-300">{data.vendedor.nome}</span> já possui {(data.vendedorRunningCampaigns ?? []).length === 1 ? "uma campanha" : `${(data.vendedorRunningCampaigns ?? []).length} campanhas`} em execução:
                  </p>
                </div>
              </div>

              <ul className="mb-5 space-y-1.5">
                {(data.vendedorRunningCampaigns ?? []).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/8 border border-amber-100 dark:border-amber-500/15">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-amber-400" />
                    </span>
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300 truncate">{c.name}</span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Iniciar outra campanha ao mesmo tempo pode acelerar os disparos e aumentar o risco de bloqueio pelo WhatsApp. Deseja continuar mesmo assim?
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRunningModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setConfirmRunningModal(false)
                    proceedStartOrResume("START")
                  }}
                  disabled={actioning}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Iniciar mesmo assim
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/campanhas")}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">{data.name}</h1>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                <span className="relative flex h-1.5 w-1.5">
                  {cfg.pulse && (
                    <span className={`animate-ping absolute h-full w-full rounded-full ${cfg.dot} opacity-75`} />
                  )}
                  <span className={`relative rounded-full h-1.5 w-1.5 ${cfg.dot}`} />
                </span>
                {cfg.label}
              </span>
              {status === "SCHEDULED" && data.scheduledAt && (
                <>
                  <span className="text-slate-300 dark:text-slate-700 text-xs">·</span>
                  <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <CalendarClock className="w-3 h-3" />
                    {new Date(data.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </>
              )}
              <span className="text-slate-300 dark:text-slate-700 text-xs">·</span>
              <span className="text-xs text-slate-500 dark:text-slate-600">{data.vendedor.nome}</span>
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchData}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            title="Atualizar agora"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleDuplicate}
            disabled={duplicating}
            title="Duplicar campanha"
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-50"
          >
            {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Duplicar</span>
          </button>

          {(isDraft || isPaused) && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleStartOrResume}
              disabled={actioning}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/30"
            >
              <Play className="w-4 h-4" />
              <span>{isPaused ? "Retomar" : "Iniciar"}</span>
            </motion.button>
          )}
          {isRunning && data.scheduleRules.length > 0 && !data.estimate?.inWindow && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleForceDispatch}
              disabled={forcingDispatch}
              title={data.forceDispatch ? "Parar forçamento e aguardar janela" : "Disparar agora, ignorando a janela de horário"}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 border ${
                data.forceDispatch
                  ? "bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-200 dark:border-violet-500/20"
                  : "bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
              }`}
            >
              {forcingDispatch ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : data.forceDispatch ? (
                <ZapOff className="w-4 h-4" />
              ) : (
                <ZapIcon className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {data.forceDispatch ? "Parar Forçamento" : "Forçar Disparos"}
              </span>
            </motion.button>
          )}
          {isRunning && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => callAction("PAUSE")}
              disabled={actioning}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-sm font-semibold transition-colors disabled:opacity-50 border border-amber-200 dark:border-amber-500/20"
            >
              <Pause className="w-4 h-4" />
              <span>Pausar</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Banners: instance health + schedule window ────────────────────── */}
      <AnimatePresence>
        {instanceState !== "open" && instanceState !== "unknown" && (
          <motion.div
            key="instance-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
              instanceState === "connecting"
                ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
            }`}
          >
            {instanceState === "connecting" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">
              {instanceState === "connecting"
                ? `Instância "${data.vendedor.nome}" está reconectando — envios pausados até reconectar`
                : `Instância "${data.vendedor.nome}" está desconectada — os envios estão falhando`}
            </span>
            <a
              href="/instancias"
              className="ml-auto text-xs underline underline-offset-2 opacity-70 hover:opacity-100 shrink-0"
            >
              Reconectar →
            </a>
          </motion.div>
        )}
        {isRunning && data.scheduleRules.length > 0 && !data.estimate?.inWindow && data.estimate?.nextWindowStart && (
          <ScheduleWindowBanner
            key="schedule-banner"
            nextWindowStart={data.estimate.nextWindowStart}
            nextWindowStartTime={data.estimate.nextWindowStartTime ?? null}
            forced={data.forceDispatch}
          />
        )}
      </AnimatePresence>

      {/* ── Summary strip ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {data.list && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            <Users className="w-3 h-3" />
            {data.list.name} · {data.list._count.items.toLocaleString()} contatos
          </span>
        )}
        {data.template && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            <Layers className="w-3 h-3" />
            {data.template.name} · {data.template._count.steps} passo{data.template._count.steps !== 1 ? "s" : ""}
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
          <Smartphone className="w-3 h-3" />
          {data.vendedor.nome}
        </span>
        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
          <Clock className="w-3 h-3" />
          Delay: {fmtSec(data.minDelay)} – {fmtSec(data.maxDelay)}
        </span>
        {data.scheduleRules.length > 0 && (() => {
          const windows = [...new Set(data.scheduleRules.map((r) => `${r.startTime}–${r.endTime}`))]
          return windows.length === 1 ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
              {windows[0]}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
              {windows.length} janelas de horário
            </span>
          )
        })()}
        {data.scheduleRules.length > 0 && (() => {
          const SCHED_DAY: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" }
          const days = [...new Set(data.scheduleRules.map((r) => r.dayOfWeek))].sort((a, b) => a - b)
          return (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
              {days.map((d) => SCHED_DAY[d] ?? d).join(", ")}
            </span>
          )
        })()}
        {data.maxSendsPerDay > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-500 dark:text-slate-400">
            máx {data.maxSendsPerDay}/dia
          </span>
        )}
      </div>

      {/* ── Metrics row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total de Leads"
          value={counts.total}
          icon={Users}
          color="bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400"
        />
        <MetricCard
          label="Disparados"
          value={counts.sending + counts.sent + counts.completed}
          icon={Send}
          color="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <MetricCard
          label="Na Fila"
          value={counts.pending}
          icon={Clock}
          color="bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />
        <MetricCard
          label="Falhas"
          value={counts.failed}
          icon={XCircle}
          color="bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
        />
      </div>

      {/* ── Delivery funnel ──────────────────────────────────────────────── */}
      {(() => {
        const dispatched = counts.sending + counts.sent + counts.completed
        const hasAckData = counts.delivered > 0 || counts.read > 0
        if (dispatched === 0) return null
        const pctDelivered = dispatched > 0 ? Math.round((counts.delivered / dispatched) * 100) : 0
        const pctRead      = dispatched > 0 ? Math.round((counts.read      / dispatched) * 100) : 0
        const pctReplied   = dispatched > 0 ? Math.round((counts.replied   / dispatched) * 100) : 0
        return (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-violet-500" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Funil de Entrega</p>
              {!hasAckData && (
                <span className="text-[10px] text-slate-400 ml-auto">Aguardando confirmações do WhatsApp</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              {/* Disparados */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Send className="w-3 h-3" />Disparados</span>
                  <span className="font-semibold text-slate-900 dark:text-white">100%</span>
                </div>
                <div className="h-2 rounded-full bg-blue-100 dark:bg-blue-500/20">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: "100%" }} />
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{dispatched.toLocaleString("pt-BR")}</p>
              </div>
              {/* Entregues */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><PackageCheck className="w-3 h-3" />Entregues</span>
                  <span className={`font-semibold ${hasAckData ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{pctDelivered}%</span>
                </div>
                <div className="h-2 rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pctDelivered}%` }} />
                </div>
                <p className={`text-lg font-bold tabular-nums ${hasAckData ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
                  {hasAckData ? counts.delivered.toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              {/* Lidos */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />Lidos</span>
                  <span className={`font-semibold ${hasAckData ? "text-violet-600 dark:text-violet-400" : "text-slate-400"}`}>{pctRead}%</span>
                </div>
                <div className="h-2 rounded-full bg-violet-100 dark:bg-violet-500/20">
                  <div className="h-full rounded-full bg-violet-500 transition-all duration-700" style={{ width: `${pctRead}%` }} />
                </div>
                <p className={`text-lg font-bold tabular-nums ${hasAckData ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
                  {hasAckData ? counts.read.toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              {/* Responderam */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />Responderam</span>
                  <span className={`font-semibold ${counts.replied > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>{pctReplied}%</span>
                </div>
                <div className="h-2 rounded-full bg-amber-100 dark:bg-amber-500/20">
                  <div className="h-full rounded-full bg-amber-500 transition-all duration-700" style={{ width: `${pctReplied}%` }} />
                </div>
                <p className={`text-lg font-bold tabular-nums ${counts.replied > 0 ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>
                  {counts.replied > 0 ? counts.replied.toLocaleString("pt-BR") : "—"}
                </p>
                {counts.replied > 0 && counts.repliedViaRemarketing > 0 && (
                  <p className="text-[9px] text-slate-400 dark:text-slate-600 leading-tight -mt-1">
                    {(counts.replied - counts.repliedViaRemarketing).toLocaleString("pt-BR")} direto
                    {" · "}
                    {counts.repliedViaRemarketing.toLocaleString("pt-BR")} follow-up
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Estimate panel ───────────────────────────────────────────────── */}
      {(isRunning || isPaused) && counts.pending > 0 && data.estimate && (
        <EstimatePanel estimate={data.estimate} pending={counts.pending} />
      )}

      {/* ── Next Send countdown ──────────────────────────────────────────── */}
      {/* Only show when the worker can actually dispatch:
          in-window, OR force dispatch active, OR no schedule rules (24/7) */}
      <AnimatePresence>
        {isRunning &&
          (data.estimate?.inWindow || data.forceDispatch || data.scheduleRules.length === 0) && (() => {
            const activeSending = data.sentMessages.find(m => m.status === "SENDING") ?? null
            if (!data.nextPending && !activeSending) return null
            return (
              <NextSendCard
                key={data.nextPending?.id ?? activeSending?.id}
                nextPending={data.nextPending}
                activeSending={activeSending}
                onSkip={sendNow}
              />
            )
          })()}
      </AnimatePresence>

      {/* ── Progress + Tabbed Logs ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
        {/* Progress ring */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 flex flex-col items-center gap-4">
          <div className="relative">
            <ProgressRing progress={progress} status={status} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{progress}%</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-600">concluído</span>
            </div>
          </div>
          <div className="text-center space-y-1 w-full">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Enviados</span>
              <span className="text-slate-900 dark:text-white font-medium">{(counts.sending + counts.sent + counts.completed).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Na fila</span>
              <span className="text-violet-400 font-medium">{counts.pending.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Falhas</span>
              <span className="text-rose-400 font-medium">{counts.failed.toLocaleString()}</span>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 dark:text-slate-700 text-center">
            {isRunning
              ? `Atualizando a cada 5s · ${new Date(lastRefresh).toLocaleTimeString("pt-BR")}`
              : "Polling pausado"}
          </p>
        </div>

        {/* Tabbed log panel */}
        <TabbedLogPanel
          data={data}
          counts={counts}
          isRunning={isRunning}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRemoveFromQueue={removeFromQueue}
        />
      </div>

      {/* ── Follow-up / Remarketing section ──────────────────────────────── */}
      {data.enableRemarketing && (
        <RemarketingSection
          campaignId={initial.id}
          isRunning={isRunning}
          config={{
            scripts: data.rmktScripts,
            intervalMinutes: data.rmktIntervalMinutes,
            windowStart: data.rmktWindowStart,
            windowEnd: data.rmktWindowEnd,
            allowedDays: data.rmktAllowedDays,
            maxPerDay: data.rmktMaxPerDay,
            paused: data.rmktPaused,
          }}
          onPauseToggle={fetchData}
        />
      )}
    </div>
  )
}
