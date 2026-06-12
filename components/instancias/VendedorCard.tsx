"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Trash2, RefreshCw, Megaphone, Users, Loader2 } from "lucide-react"

type InstanceStatus = {
  status: "ready" | "not_ready"
  state: string | null
  authenticated: boolean
  lastError: string | null
}

type DisplayStatus = "online" | "waiting_qr" | "disconnected" | "loading"

type VendedorCardProps = {
  id: string
  nome: string
  userId: string
  campanhasCount: number
  listasCount: number
  onDelete: (userId: string) => void
  onReconnect: (userId: string, nome: string) => void
  onViewInsights: (userId: string, nome: string) => void
}

const gradients = [
  "from-violet-600 to-indigo-600",
  "from-emerald-600 to-teal-600",
  "from-rose-600 to-pink-600",
  "from-amber-600 to-orange-600",
  "from-blue-600 to-cyan-600",
]

function getGradient(name: string): string {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return gradients[hash % gradients.length]!
}

function resolveStatus(data: InstanceStatus | null, isLoading: boolean): DisplayStatus {
  if (isLoading) return "loading"
  if (!data) return "disconnected"
  if (data.status === "ready") return "online"
  if (data.state === "OPENING" || (!data.authenticated && data.state !== "DISCONNECTED"))
    return "waiting_qr"
  return "disconnected"
}

const statusConfig: Record<
  DisplayStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  online: {
    label: "Online",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  waiting_qr: {
    label: "Aguardando QR",
    dot: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  disconnected: {
    label: "Desconectado",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
  loading: {
    label: "Verificando...",
    dot: "bg-slate-400",
    text: "text-slate-500",
    bg: "bg-slate-100 dark:bg-slate-500/10",
  },
}

export function VendedorCard({
  id,
  nome,
  userId,
  campanhasCount,
  listasCount,
  onDelete,
  onReconnect,
  onViewInsights,
}: VendedorCardProps) {
  const [statusData, setStatusData] = useState<InstanceStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const displayStatus = resolveStatus(statusData, isLoading)
  const cfg = statusConfig[displayStatus]

  useEffect(() => {
    let active = true

    const poll = async () => {
      try {
        const res = await fetch(`/api/instances/${userId}/status`, { cache: "no-store" })
        if (res.ok && active) {
          setStatusData(await res.json())
          setIsLoading(false)
        }
      } catch {
        if (active) setIsLoading(false)
      }
    }

    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [userId])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/instances/${userId}`, { method: "DELETE" })
      if (res.ok) {
        onDelete(userId)
      } else {
        setDeleting(false)
        setConfirmDelete(false)
      }
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const initials = nome
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="relative rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none backdrop-blur-sm p-5 flex flex-col gap-4 group"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        {/* Avatar */}
        <div
          className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getGradient(nome)} flex items-center justify-center text-white font-bold text-sm shadow-lg`}
        >
          {initials}
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
          <span className="relative flex h-1.5 w-1.5">
            {(displayStatus === "online" || displayStatus === "waiting_qr") && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`}
              />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${cfg.dot}`} />
          </span>
          {cfg.label}
        </div>
      </div>

      {/* Vendor info */}
      <div>
        <p className="font-semibold text-slate-900 dark:text-white text-sm">{nome}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{userId}</p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Megaphone className="w-3 h-3" />
          {campanhasCount} campanha{campanhasCount !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          {listasCount} lista{listasCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/5">
        {displayStatus === "online" ? (
          <button
            onClick={() => onViewInsights(userId, nome)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-600/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Ver Insights
          </button>
        ) : (
          <button
            onClick={() => onReconnect(userId, nome)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Reconectar
          </button>
        )}

        <AnimatePresence mode="wait">
          {confirmDelete ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1.5 ml-auto overflow-hidden"
            >
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Confirmar
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="delete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(true)}
              className="ml-auto p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
