"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  Plus,
  Megaphone,
  Play,
  Pause,
  Trash2,
  Users,
  CalendarClock,
  Copy,
  Repeat,
  AlertTriangle,
  LayoutGrid,
  Columns3,
  WifiOff,
  Loader2,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED"
type DisplayStatus  = CampaignStatus | "FOLLOWUP"
type ViewMode       = "grid" | "kanban"
type InstanceHealth = "online" | "connecting" | "offline" | null

type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  createdAt: string
  scheduledAt: string | null
  vendedor: { nome: string; userId: string } | null
  list: { name: string } | null
  template: { name: string } | null
  _stats: { sent: number; pending: number; failed: number; total: number; pendingRmkt: number }
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  DisplayStatus,
  { label: string; bg: string; text: string; dot: string; pulse?: boolean; icon?: React.ElementType }
> = {
  DRAFT:     { label: "Rascunho",  bg: "bg-slate-100 dark:bg-slate-500/10",    text: "text-slate-500",                       dot: "bg-slate-400 dark:bg-slate-500" },
  SCHEDULED: { label: "Agendado",  bg: "bg-blue-50 dark:bg-blue-500/10",       text: "text-blue-600 dark:text-blue-400",      dot: "bg-blue-500" },
  RUNNING:   { label: "Rodando",   bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-600 dark:text-violet-400",  dot: "bg-violet-500", pulse: true },
  PAUSED:    { label: "Pausado",   bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-600 dark:text-amber-400",    dot: "bg-amber-400" },
  COMPLETED: { label: "Concluído", bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400",dot: "bg-emerald-500" },
  FAILED:    { label: "Falhou",    bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-600 dark:text-rose-400",      dot: "bg-rose-500" },
  FOLLOWUP:  { label: "Follow-up", bg: "bg-teal-50 dark:bg-teal-500/10",       text: "text-teal-600 dark:text-teal-400",      dot: "bg-teal-500", pulse: true, icon: Repeat },
}

const STATUS_ORDER: Record<DisplayStatus, number> = {
  RUNNING: 0, PAUSED: 1, SCHEDULED: 2, DRAFT: 3, FOLLOWUP: 4, COMPLETED: 5, FAILED: 6,
}

const COL_GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-pink-500",
  "from-amber-500 to-orange-500",
  "from-blue-500 to-cyan-500",
  "from-fuchsia-500 to-purple-500",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayStatus(c: Campaign): DisplayStatus {
  if (c.status === "COMPLETED" && c._stats.pendingRmkt > 0) return "FOLLOWUP"
  return c.status
}

function colGradient(name: string): string {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return COL_GRADIENTS[hash % COL_GRADIENTS.length]!
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ campaign }: { campaign: Campaign }) {
  const ds  = getDisplayStatus(campaign)
  const cfg = STATUS_CFG[ds]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0 ${cfg.bg} ${cfg.text}`}>
      {Icon ? (
        <Icon className="w-3 h-3" />
      ) : (
        <span className="relative flex h-1.5 w-1.5">
          {cfg.pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${cfg.dot}`} />
        </span>
      )}
      {cfg.label}
      {ds === "FOLLOWUP" && <span className="opacity-60">· {campaign._stats.pendingRmkt}</span>}
    </span>
  )
}

// ─── CardHandlers ─────────────────────────────────────────────────────────────

type CardHandlers = {
  onDetails:       (id: string) => void
  onStart:         (id: string, action: "START" | "RESUME") => void
  onPause:         (id: string) => void
  onDuplicate:     (id: string) => void
  onDeleteRequest: (id: string) => void
  onDeleteCancel:  () => void
  onDeleteConfirm: (id: string) => void
  actioning:     string | null
  duplicating:   string | null
  confirmDelete: string | null
}

// ─── CampaignCard ─────────────────────────────────────────────────────────────

function CampaignCard({ c, hideVendedor = false, handlers }: {
  c: Campaign
  hideVendedor?: boolean
  handlers: CardHandlers
}) {
  const { sent, total, failed, pending } = c._stats
  const progress    = total > 0 ? Math.round((sent / total) * 100) : 0
  const isRunning   = c.status === "RUNNING"
  const isPaused    = c.status === "PAUSED"
  const isDraft     = c.status === "DRAFT"
  const isScheduled = c.status === "SCHEDULED"
  const canStart    = isDraft || isPaused || isScheduled
  const canPause    = isRunning || isScheduled
  const loading     = handlers.actioning === c.id

  const subtitle = !hideVendedor
    ? [c.vendedor?.nome, c.list?.name ?? c.template?.name].filter(Boolean).join(" · ")
    : (c.list?.name ?? c.template?.name ?? null)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="group rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4 flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white text-sm truncate leading-snug">{c.name}</p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>
          )}
          {isScheduled && c.scheduledAt && (
            <p className="text-[10px] text-blue-500 dark:text-blue-400 flex items-center gap-1 mt-1">
              <CalendarClock className="w-3 h-3 shrink-0" />
              {new Date(c.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <StatusBadge campaign={c} />
      </div>

      {/* Progress */}
      {total > 0 ? (
        <div className="space-y-1">
          <div className="h-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`h-full rounded-full ${
                getDisplayStatus(c) === "FOLLOWUP" ? "bg-teal-500"
                : c.status === "COMPLETED"         ? "bg-emerald-500"
                : c.status === "FAILED"            ? "bg-rose-500"
                : "bg-violet-500"
              }`}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-600 tabular-nums">
            <span>{sent.toLocaleString()} / {total.toLocaleString()}</span>
            <span className="flex items-center gap-2">
              {pending > 0 && <span>{pending} pendentes</span>}
              {failed > 0  && <span className="text-rose-500">{failed} falhas</span>}
              <span>{progress}%</span>
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 dark:text-slate-600 flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          {isDraft ? "Fila ainda não populada" : "Sem contatos na fila"}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
        <button
          onClick={() => handlers.onDetails(c.id)}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          Detalhes
        </button>

        {canStart && (
          <button
            onClick={() => handlers.onStart(c.id, isPaused ? "RESUME" : "START")}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {isPaused ? "Retomar" : isScheduled ? "Iniciar agora" : "Iniciar"}
          </button>
        )}
        {canPause && (
          <button
            onClick={() => handlers.onPause(c.id)}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />}
            Pausar
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => handlers.onDuplicate(c.id)}
            disabled={handlers.duplicating === c.id}
            title="Duplicar"
            className="p-1 rounded-md text-slate-300 dark:text-slate-700 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
          >
            {handlers.duplicating === c.id
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>

          <AnimatePresence mode="wait">
            {handlers.confirmDelete === c.id ? (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-1"
              >
                <button onClick={handlers.onDeleteCancel}
                  className="text-[10px] px-2 py-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                  Não
                </button>
                <button onClick={() => handlers.onDeleteConfirm(c.id)} disabled={loading}
                  className="text-[10px] font-medium px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors">
                  Excluir
                </button>
              </motion.div>
            ) : (
              <motion.button key="trash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => handlers.onDeleteRequest(c.id)}
                className="p-1 rounded-md text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/[0.08] transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

// ─── HealthDot ────────────────────────────────────────────────────────────────

function HealthDot({ health }: { health: InstanceHealth }) {
  if (health === "online") return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-60" />
      <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  )
  if (health === "connecting") return (
    <Loader2 className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
  )
  if (health === "offline") return (
    <WifiOff className="w-3 h-3 text-rose-400 shrink-0" />
  )
  // null = still loading — pulsing neutral dot
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-pulse absolute h-full w-full rounded-full bg-slate-300 dark:bg-slate-600 opacity-60" />
      <span className="relative rounded-full h-2 w-2 bg-slate-300 dark:bg-slate-600" />
    </span>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({ userId, nome, campaigns, handlers }: {
  userId: string | null
  nome: string
  campaigns: Campaign[]
  handlers: CardHandlers
}) {
  const [health, setHealth] = useState<InstanceHealth>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    const poll = async () => {
      try {
        const res = await fetch(`/api/instances/${userId}/status`, { cache: "no-store" })
        if (!res.ok || !active) return
        const data = await res.json() as { status?: string; state?: string }
        if (!active) return
        if (data.status === "ready")        setHealth("online")
        else if (data.state === "connecting") setHealth("connecting")
        else                                  setHealth("offline")
      } catch { /* noop */ }
    }
    poll()
    const interval = setInterval(poll, 15_000)
    return () => { active = false; clearInterval(interval) }
  }, [userId])

  const runningCampaigns = campaigns.filter((c) => c.status === "RUNNING")
  const hasRunning       = runningCampaigns.length > 0
  const totalSent        = runningCampaigns.reduce((s, c) => s + c._stats.sent, 0)
  const totalContacts    = runningCampaigns.reduce((s, c) => s + c._stats.total, 0)
  const sorted           = [...campaigns].sort((a, b) => STATUS_ORDER[getDisplayStatus(a)] - STATUS_ORDER[getDisplayStatus(b)])
  const initials         = nome.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
  const gradient         = colGradient(nome)

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div className={`rounded-xl mb-3 border px-3 py-2.5 ${
        hasRunning
          ? "bg-violet-50 dark:bg-violet-500/[0.07] border-violet-200 dark:border-violet-500/20"
          : "bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06]"
      }`}>
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
            <span className="text-[10px] font-bold text-white leading-none">{initials || "?"}</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-xs text-slate-800 dark:text-white truncate leading-tight">{nome}</p>
            {hasRunning && totalContacts > 0 && (
              <p className="text-[10px] text-violet-500 dark:text-violet-400 tabular-nums leading-tight mt-0.5">
                {totalSent.toLocaleString()} / {totalContacts.toLocaleString()} enviados
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {userId && <HealthDot health={health} />}
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {campaigns.length}
            </span>
          </div>
        </div>

        {/* Running chip */}
        {hasRunning && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute h-full w-full rounded-full bg-violet-500 opacity-60" />
              <span className="relative rounded-full h-1.5 w-1.5 bg-violet-500" />
            </span>
            <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              {runningCampaigns.length === 1
                ? "1 campanha rodando"
                : `${runningCampaigns.length} campanhas rodando`}
            </span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2.5">
        <AnimatePresence>
          {sorted.map((c) => (
            <CampaignCard key={c.id} c={c} hideVendedor handlers={handlers} />
          ))}
        </AnimatePresence>
        {campaigns.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.05] p-5 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-600">
            <Megaphone className="w-4 h-4 shrink-0" />
            <span className="text-[11px]">Sem campanhas</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { initial: Campaign[] }

export function CampaignsList({ initial }: Props) {
  const router = useRouter()
  const [campaigns,     setCampaigns]     = useState<Campaign[]>(initial)
  const [actioning,     setActioning]     = useState<string | null>(null)
  const [duplicating,   setDuplicating]   = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmRunning, setConfirmRunning] = useState<{ campaignId: string; names: string[] } | null>(null)
  const [viewMode,      setViewMode]      = useState<ViewMode>("grid")

  // Persist view preference
  useEffect(() => {
    const saved = localStorage.getItem("campaigns-view") as ViewMode | null
    if (saved === "grid" || saved === "kanban") setViewMode(saved)
  }, [])
  const switchView = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem("campaigns-view", mode)
  }

  // Kanban columns grouped by vendedor, active columns sorted first
  const kanbanColumns = useMemo(() => {
    const map = new Map<string, { nome: string; userId: string | null; campaigns: Campaign[] }>()
    for (const c of campaigns) {
      const key = c.vendedor?.userId ?? "__none__"
      if (!map.has(key)) {
        map.set(key, { nome: c.vendedor?.nome ?? "Sem instância", userId: c.vendedor?.userId ?? null, campaigns: [] })
      }
      map.get(key)!.campaigns.push(c)
    }
    return [...map.values()].sort((a, b) => {
      const aR = a.campaigns.some((c) => c.status === "RUNNING")
      const bR = b.campaigns.some((c) => c.status === "RUNNING")
      if (aR !== bR) return aR ? -1 : 1
      return a.nome.localeCompare(b.nome, "pt-BR")
    })
  }, [campaigns])

  const handleDuplicate = useCallback(async (id: string) => {
    setDuplicating(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" })
      if (!res.ok) return
      const { id: newId } = await res.json() as { id: string }
      router.push(`/campanhas/${newId}/editar`)
    } finally {
      setDuplicating(null)
    }
  }, [router])

  const callAction = useCallback(async (id: string, action: "START" | "PAUSE" | "RESUME") => {
    setActioning(id)
    try {
      await fetch(`/api/campaigns/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const newStatus: CampaignStatus = action === "PAUSE" ? "PAUSED" : "RUNNING"
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)))
    } finally {
      setActioning(null)
    }
  }, [])

  const handleStartClick = useCallback((id: string, action: "START" | "RESUME") => {
    if (action === "START") {
      const campaign = campaigns.find((c) => c.id === id)
      const running  = campaigns.filter(
        (c) => c.id !== id && c.status === "RUNNING" && c.vendedor?.userId === campaign?.vendedor?.userId && !!campaign?.vendedor?.userId
      )
      if (running.length > 0) {
        setConfirmRunning({ campaignId: id, names: running.map((c) => c.name) })
        return
      }
    }
    callAction(id, action)
  }, [campaigns, callAction])

  const handleDelete = useCallback(async (id: string) => {
    setActioning(id)
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" })
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    } finally {
      setActioning(null)
      setConfirmDelete(null)
    }
  }, [])

  const handlers = useMemo<CardHandlers>(() => ({
    onDetails:       (id) => router.push(`/campanhas/${id}`),
    onStart:         handleStartClick,
    onPause:         (id) => callAction(id, "PAUSE"),
    onDuplicate:     handleDuplicate,
    onDeleteRequest: setConfirmDelete,
    onDeleteCancel:  () => setConfirmDelete(null),
    onDeleteConfirm: handleDelete,
    actioning,
    duplicating,
    confirmDelete,
  }), [router, handleStartClick, callAction, handleDuplicate, handleDelete, actioning, duplicating, confirmDelete])

  return (
    <>
      {/* ── Confirm: start with already-running campaign ─────────────────── */}
      <AnimatePresence>
        {confirmRunning && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setConfirmRunning(null)}
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
                    Este vendedor já possui {confirmRunning.names.length === 1 ? "uma campanha" : `${confirmRunning.names.length} campanhas`} em execução:
                  </p>
                </div>
              </div>
              <ul className="mb-5 space-y-1.5">
                {confirmRunning.names.map((name) => (
                  <li key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/8 border border-amber-100 dark:border-amber-500/15">
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-amber-400" />
                    </span>
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300 truncate">{name}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Iniciar outra campanha ao mesmo tempo pode acelerar os disparos e aumentar o risco de bloqueio pelo WhatsApp. Deseja continuar mesmo assim?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmRunning(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { const { campaignId } = confirmRunning; setConfirmRunning(null); callAction(campaignId, "START") }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors"
                >
                  Iniciar mesmo assim
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <p className="text-xs text-slate-400 dark:text-slate-500 shrink-0">
          {campaigns.length > 0
            ? `${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""}`
            : "Nenhuma campanha"}
        </p>

        <div className="flex items-center gap-2 ml-auto">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-white/[0.08] overflow-hidden">
            <button
              onClick={() => switchView("grid")}
              title="Visão em grade"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === "grid"
                  ? "bg-slate-100 dark:bg-white/[0.08] text-slate-800 dark:text-white font-medium"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grade</span>
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-white/[0.07]" />
            <button
              onClick={() => switchView("kanban")}
              title="Kanban por instância"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
                viewMode === "kanban"
                  ? "bg-slate-100 dark:bg-white/[0.08] text-slate-800 dark:text-white font-medium"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
          </div>

          <button
            onClick={() => router.push("/campanhas/nova")}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {campaigns.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-16 flex flex-col items-center gap-3 text-center"
        >
          <Megaphone className="w-8 h-8 text-slate-300 dark:text-slate-700" />
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nenhuma campanha ainda</p>
            <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
              Crie sua primeira campanha para começar a disparar mensagens.
            </p>
          </div>
          <button
            onClick={() => router.push("/campanhas/nova")}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-400 transition-colors mt-1"
          >
            Criar agora
          </button>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          {viewMode === "grid" ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3"
            >
              <AnimatePresence>
                {campaigns.map((c) => (
                  <CampaignCard key={c.id} c={c} handlers={handlers} />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="kanban"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="overflow-x-auto pb-4 -mx-1 px-1"
            >
              <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                {kanbanColumns.map((col) => (
                  <KanbanColumn
                    key={col.userId ?? "__none__"}
                    userId={col.userId}
                    nome={col.nome}
                    campaigns={col.campaigns}
                    handlers={handlers}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  )
}
