"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  Plus,
  Megaphone,
  Play,
  Pause,
  Trash2,
  BarChart2,
  Users,
  ExternalLink,
  CalendarClock,
  Copy,
} from "lucide-react"

type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED"

type Campaign = {
  id: string
  name: string
  status: CampaignStatus
  createdAt: string
  scheduledAt: string | null
  vendedor: { nome: string; userId: string }
  list: { name: string } | null
  template: { name: string } | null
  _stats: { sent: number; pending: number; failed: number; total: number }
}

const STATUS_CFG: Record<
  CampaignStatus,
  { label: string; bg: string; text: string; dot: string; pulse?: boolean }
> = {
  DRAFT:      { label: "Rascunho",  bg: "bg-slate-100 dark:bg-slate-500/10",   text: "text-slate-500",                     dot: "bg-slate-400 dark:bg-slate-500" },
  SCHEDULED:  { label: "Agendado",  bg: "bg-blue-50 dark:bg-blue-500/10",      text: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-500" },
  RUNNING:    { label: "Rodando",   bg: "bg-violet-50 dark:bg-violet-500/10",  text: "text-violet-600 dark:text-violet-400",dot: "bg-violet-500", pulse: true },
  PAUSED:     { label: "Pausado",   bg: "bg-amber-50 dark:bg-amber-500/10",    text: "text-amber-600 dark:text-amber-400",  dot: "bg-amber-400" },
  COMPLETED:  { label: "Concluído", bg: "bg-emerald-50 dark:bg-emerald-500/10",text: "text-emerald-600 dark:text-emerald-400",dot: "bg-emerald-500" },
  FAILED:     { label: "Falhou",    bg: "bg-rose-50 dark:bg-rose-500/10",      text: "text-rose-600 dark:text-rose-400",    dot: "bg-rose-500" },
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CFG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className="relative flex h-1.5 w-1.5">
        {cfg.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${cfg.dot}`} />
      </span>
      {cfg.label}
    </span>
  )
}

type Props = { initial: Campaign[] }

export function CampaignsList({ initial }: Props) {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>(initial)
  const [actioning, setActioning] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDuplicate = async (id: string) => {
    setDuplicating(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" })
      if (!res.ok) return
      const { id: newId } = await res.json() as { id: string }
      router.push(`/campanhas/${newId}/editar`)
    } finally {
      setDuplicating(null)
    }
  }

  const callAction = async (id: string, action: "START" | "PAUSE" | "RESUME") => {
    setActioning(id)
    try {
      await fetch(`/api/campaigns/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const newStatus: CampaignStatus =
        action === "PAUSE" ? "PAUSED" : "RUNNING"
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      )
    } finally {
      setActioning(null)
    }
  }

  const handleDelete = async (id: string) => {
    setActioning(id)
    try {
      await fetch(`/api/campaigns/${id}`, { method: "DELETE" })
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    } finally {
      setActioning(null)
      setConfirmDelete(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {campaigns.length > 0
            ? `${campaigns.length} campanha${campaigns.length !== 1 ? "s" : ""}`
            : "Nenhuma campanha criada ainda"}
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/campanhas/nova")}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </motion.button>
      </div>

      {campaigns.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-14 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-600/10 flex items-center justify-center">
            <Megaphone className="w-7 h-7 text-violet-500 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Nenhuma campanha</p>
            <p className="text-sm text-slate-500 mt-1">
              Crie sua primeira campanha para começar a disparar mensagens.
            </p>
          </div>
          <button
            onClick={() => router.push("/campanhas/nova")}
            className="text-xs font-medium px-4 py-2 rounded-xl bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors"
          >
            + Criar agora
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {campaigns.map((c) => {
              const { sent, total, failed, pending } = c._stats
              const progress = total > 0 ? Math.round((sent / total) * 100) : 0
              const isRunning = c.status === "RUNNING"
              const isPaused = c.status === "PAUSED"
              const isDraft = c.status === "DRAFT"
              const isScheduled = c.status === "SCHEDULED"
              const canStart = isDraft || isPaused || isScheduled
              const canPause = isRunning || isScheduled
              const loading = actioning === c.id

              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  className="group rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none p-5 flex flex-col gap-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {c.vendedor.nome}
                        {c.list && <> · {c.list.name}</>}
                      </p>
                      {isScheduled && c.scheduledAt && (
                        <p className="text-[10px] text-blue-500 dark:text-blue-400 flex items-center gap-1 mt-1">
                          <CalendarClock className="w-3 h-3 shrink-0" />
                          {new Date(c.scheduledAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>

                  {/* Progress bar */}
                  {total > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <BarChart2 className="w-3 h-3" />
                          {sent.toLocaleString()} / {total.toLocaleString()} enviados
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            c.status === "COMPLETED"
                              ? "bg-emerald-500"
                              : c.status === "FAILED"
                              ? "bg-rose-500"
                              : "bg-violet-500"
                          }`}
                        />
                      </div>
                      <div className="flex gap-3 text-[9px] text-slate-400 dark:text-slate-600">
                        {pending > 0 && <span>{pending} pendentes</span>}
                        {failed > 0 && <span className="text-rose-500">{failed} falhas</span>}
                      </div>
                    </div>
                  )}

                  {total === 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-600">
                      <Users className="w-3 h-3" />
                      {isDraft ? "Fila ainda não populada" : "Sem contatos na fila"}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
                    {/* Detail link */}
                    <button
                      onClick={() => router.push(`/campanhas/${c.id}`)}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Detalhes
                    </button>

                    {/* Start / Pause */}
                    {canStart && (
                      <button
                        onClick={() => callAction(c.id, isPaused ? "RESUME" : "START")}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3 h-3" />
                        {isPaused ? "Retomar" : isScheduled ? "Iniciar agora" : "Iniciar"}
                      </button>
                    )}
                    {canPause && (
                      <button
                        onClick={() => callAction(c.id, "PAUSE")}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3 h-3" />
                        Pausar
                      </button>
                    )}

                    {/* Duplicate */}
                    <button
                      onClick={() => handleDuplicate(c.id)}
                      disabled={duplicating === c.id}
                      title="Duplicar campanha"
                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-600 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <AnimatePresence mode="wait">
                      {confirmDelete === c.id ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          className="flex items-center gap-1 ml-auto"
                        >
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[10px] px-2 py-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            Não
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={loading}
                            className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                          >
                            Excluir
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="trash"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setConfirmDelete(c.id)}
                          className="ml-auto p-1.5 rounded-lg text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}
