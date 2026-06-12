"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Smartphone,
  Send,
  Inbox,
  Loader2,
  WifiOff,
  MessageSquare,
  Clock,
  Power,
  AlertTriangle,
} from "lucide-react"

type InstanceInsight = {
  userId: string
  instanceId: string
  createdAt: string
  ready: boolean
  number: string | null
  totalApiCalls: number
  sentMessages: number
  receivedMessages: number
  authenticated: boolean
  state: string | null
  queueLength: number
  cachedLogs: number
}

type Props = {
  userId: string
  nome: string
  onClose: () => void
  onDisconnected: () => void
}

function StatBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/5 p-4 flex flex-col gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

export function InsightDrawer({ userId, nome, onClose, onDisconnected }: Props) {
  const [insight, setInsight] = useState<InstanceInsight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/instances/${userId}/insights`, { cache: "no-store" })
        if (res.ok) {
          setInsight(await res.json())
        } else {
          setError("Não foi possível carregar os dados da instância.")
        }
      } catch {
        setError("Erro de conexão com a API.")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch(`/api/instances/${userId}`, { method: "DELETE" })
      onDisconnected()
      onClose()
    } catch {
      setDisconnecting(false)
      setConfirmDisconnect(false)
    }
  }

  const fmtNumber = (n: string | null) => {
    if (!n) return "—"
    const d = n.replace(/\D/g, "")
    if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
    return n
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white dark:bg-[#0d0f15] border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-600/20 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">{nome}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate">{userId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-8 h-8 text-violet-500 dark:text-violet-400 animate-spin" />
              <p className="text-sm text-slate-500">Carregando dados da instância...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <WifiOff className="w-8 h-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">{error}</p>
              <button
                onClick={() => { setLoading(true); setError(null) }}
                className="text-xs px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          ) : insight ? (
            <>
              {/* WhatsApp number */}
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/[0.08] border border-emerald-200 dark:border-emerald-500/20 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-500/70 font-semibold uppercase tracking-wider">
                    Número Conectado
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {fmtNumber(insight.number)}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Online</span>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  icon={Send}
                  label="Mensagens Enviadas"
                  value={insight.sentMessages}
                  color="bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400"
                />
                <StatBox
                  icon={Inbox}
                  label="Mensagens Recebidas"
                  value={insight.receivedMessages}
                  color="bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                />
                <StatBox
                  icon={Clock}
                  label="Fila de Envio"
                  value={insight.queueLength}
                  color={
                    insight.queueLength > 50
                      ? "bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      : insight.queueLength > 10
                      ? "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  }
                />
                <StatBox
                  icon={MessageSquare}
                  label="Total de Chamadas API"
                  value={insight.totalApiCalls}
                  color="bg-slate-100 dark:bg-slate-500/15 text-slate-500"
                />
              </div>

              {/* Instance info */}
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-4 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                  Informações da Instância
                </p>
                {[
                  { label: "ID da Instância", value: insight.instanceId },
                  { label: "Estado", value: insight.state ?? "—" },
                  { label: "Logs registrados", value: (insight.cachedLogs ?? 0).toLocaleString("pt-BR") },
                  {
                    label: "Criada em",
                    value: new Date(insight.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }),
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-700 dark:text-slate-300 font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer — Disconnect */}
        <div className="p-5 border-t border-slate-100 dark:border-white/[0.06]">
          <AnimatePresence mode="wait">
            {confirmDisconnect ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="space-y-3"
              >
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/[0.08] border border-rose-200 dark:border-rose-500/20">
                  <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700 dark:text-rose-300">
                    Isso irá desconectar o WhatsApp desta instância e remover o vendedor do sistema.
                    Campanhas em andamento serão interrompidas.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                  >
                    {disconnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Power className="w-4 h-4" />
                    )}
                    {disconnecting ? "Desconectando..." : "Confirmar"}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="disconnect-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setConfirmDisconnect(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-sm font-semibold transition-colors"
              >
                <Power className="w-4 h-4" />
                Desconectar Instância
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  )
}
