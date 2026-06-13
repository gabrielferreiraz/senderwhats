"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Smartphone, CheckCircle2, RefreshCw, AlertCircle, Clock } from "lucide-react"

type Step = "form" | "connecting" | "success"
type Mode = "add" | "reconnect"
type ConnState = "open" | "close" | "connecting" | "unknown"

type Props = {
  mode?: Mode
  vendedor?: { nome: string; userId: string }
  onClose: () => void
  onSuccess: (vendedor: { id: string; nome: string; userId: string }) => void
}

// QR code expires on WhatsApp after ~30s
const QR_LIFETIME_S = 30

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 30)
}

export function AddVendedorModal({ mode = "add", vendedor, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>(mode === "reconnect" ? "connecting" : "form")
  const [nome, setNome] = useState(vendedor?.nome ?? "")
  const [userId, setUserId] = useState(vendedor?.userId ?? "")
  const [userIdManual, setUserIdManual] = useState(false)
  const [formError, setFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // QR state
  const [connState, setConnState] = useState<ConnState>("unknown")
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrCountdown, setQrCountdown] = useState(QR_LIFETIME_S)

  const [currentUserId, setCurrentUserId] = useState(vendedor?.userId ?? "")
  const [currentNome, setCurrentNome] = useState(vendedor?.nome ?? "")

  const mountedRef = useRef(true)
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!userIdManual && mode === "add") setUserId(slugify(nome))
  }, [nome, userIdManual, mode])

  const clearAllIntervals = useCallback(() => {
    clearInterval(statusIntervalRef.current!)
    clearInterval(qrIntervalRef.current!)
    clearInterval(countdownIntervalRef.current!)
    statusIntervalRef.current = null
    qrIntervalRef.current = null
    countdownIntervalRef.current = null
  }, [])

  // ── Status polling ───────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/instances/${uid}/status`, { cache: "no-store" })
      if (!res.ok || !mountedRef.current) return
      const data = (await res.json()) as { state?: ConnState }
      const st = data.state ?? "unknown"
      if (!mountedRef.current) return
      setConnState(st)
      return st
    } catch {
      return undefined
    }
  }, [])

  // ── QR fetching ──────────────────────────────────────────────────────────────
  // NOTE: This call may take up to 6s — the route does server-side retry if the
  //       instance is still warming up after creation.

  const fetchQR = useCallback(async (uid: string) => {
    if (!mountedRef.current) return
    setQrLoading(true)
    setQrError(null)
    try {
      const res = await fetch(`/api/instances/${uid}/qr`, { cache: "no-store" })
      const data = (await res.json()) as { base64?: string | null; error?: string }
      if (!mountedRef.current) return
      if (data.base64) {
        setQrBase64(data.base64)
        setQrError(null)
        // Reset countdown when new QR arrives
        clearInterval(countdownIntervalRef.current!)
        setQrCountdown(QR_LIFETIME_S)
        countdownIntervalRef.current = setInterval(() => {
          setQrCountdown((c) => (c <= 1 ? QR_LIFETIME_S : c - 1))
        }, 1000)
      } else if (data.error === "qr_not_available") {
        // Puppeteer still initializing — retry silently after 8s (no error shown)
        setQrError(null)
        setTimeout(() => {
          if (mountedRef.current) fetchQR(uid)
        }, 8000)
      } else {
        setQrError("Não foi possível gerar o QR Code.")
      }
    } catch {
      if (mountedRef.current) setQrError("Falha de comunicação com o servidor WhatsApp.")
    } finally {
      if (mountedRef.current) setQrLoading(false)
    }
  }, [])

  // ── Orchestrate when in "connecting" step ────────────────────────────────────

  useEffect(() => {
    if (step !== "connecting" || !currentUserId) return

    const uid = currentUserId

    // Fetch QR immediately (server handles retry/create internally)
    fetchQR(uid)

    // Re-fetch QR every 30s (QR expiry window)
    qrIntervalRef.current = setInterval(() => {
      if (mountedRef.current) fetchQR(uid)
    }, QR_LIFETIME_S * 1000)

    // Poll connection status every 2s
    statusIntervalRef.current = setInterval(async () => {
      const st = await fetchStatus(uid)
      if (st === "open" && mountedRef.current) {
        clearAllIntervals()
        setStep("success")
      }
    }, 2000)

    return clearAllIntervals
  }, [step, currentUserId, fetchQR, fetchStatus, clearAllIntervals])

  // ── Success auto-close ───────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== "success") return
    const t = setTimeout(
      () => onSuccess({ id: currentUserId, nome: currentNome, userId: currentUserId }),
      1800
    )
    return () => clearTimeout(t)
  }, [step, currentUserId, currentNome, onSuccess])

  // ── Form submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")
    setSubmitting(true)
    try {
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, userId }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFormError(data.error ?? "Erro ao criar instância.")
        return
      }
      setCurrentUserId(userId)
      setCurrentNome(nome)
      setStep("connecting")
    } catch {
      setFormError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={step === "form" ? onClose : undefined}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
      />

      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-600/20 flex items-center justify-center">
                <Smartphone className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">
                {mode === "reconnect" ? `Reconectar: ${vendedor?.nome}` : "Adicionar Vendedor"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            <AnimatePresence mode="wait">

              {/* ── STEP: Form ───────────────────────────────────────────────── */}
              {step === "form" && (
                <motion.form
                  key="form"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Nome do Vendedor
                    </label>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: João Silva"
                      required
                      autoFocus
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white dark:focus:bg-white/[0.07] transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      ID Único{" "}
                      <span className="font-normal text-slate-400 dark:text-slate-600">
                        (gerado automaticamente)
                      </span>
                    </label>
                    <input
                      value={userId}
                      onChange={(e) => {
                        setUserIdManual(true)
                        setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                      }}
                      placeholder="joao_silva"
                      required
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white dark:focus:bg-white/[0.07] transition-all"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-600">
                      Apenas letras minúsculas, números e _ (usado internamente pela API)
                    </p>
                  </div>

                  {formError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded-lg"
                    >
                      {formError}
                    </motion.p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !nome || !userId}
                      className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      {submitting ? "Criando..." : "Criar e Conectar"}
                    </button>
                  </div>
                </motion.form>
              )}

              {/* ── STEP: QR Code ────────────────────────────────────────────── */}
              {step === "connecting" && (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="flex flex-col items-center gap-5 py-2"
                >
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Escaneie o QR Code
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      WhatsApp → Dispositivos vinculados → Vincular dispositivo
                    </p>
                  </div>

                  {/* QR frame */}
                  <div className="relative w-56 h-56 rounded-2xl overflow-hidden bg-white flex items-center justify-center shadow-sm ring-1 ring-black/5">
                    {qrLoading ? (
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                        <p className="text-xs">Gerando QR Code...</p>
                      </div>
                    ) : qrError ? (
                      <div className="flex flex-col items-center gap-3 px-5 text-center">
                        <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-rose-400" />
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{qrError}</p>
                        <button
                          onClick={() => fetchQR(currentUserId)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Tentar novamente
                        </button>
                      </div>
                    ) : qrBase64 ? (
                      <motion.img
                        key={qrBase64.slice(-20)}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        src={qrBase64}
                        alt="QR Code WhatsApp"
                        width={208}
                        height={208}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                        <p className="text-xs">Aguardando...</p>
                      </div>
                    )}
                  </div>

                  {/* Status bar */}
                  <div className="flex items-center justify-between w-full text-xs text-slate-400 dark:text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
                      </span>
                      Aguardando conexão
                    </div>

                    {qrBase64 && !qrLoading && (
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          expira em {qrCountdown}s
                        </span>
                        <button
                          onClick={() => fetchQR(currentUserId)}
                          className="flex items-center gap-1 hover:text-slate-300 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Novo QR
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-600">
                    Status verificado a cada 2s — a tela atualiza ao conectar
                  </p>

                  <button
                    onClick={onClose}
                    className="text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                  >
                    Fechar e continuar depois
                  </button>
                </motion.div>
              )}

              {/* ── STEP: Success ────────────────────────────────────────────── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                    className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.25, type: "spring", stiffness: 400 }}
                    >
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
                    </motion.div>
                  </motion.div>

                  <div className="text-center">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Conectado com sucesso!
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {currentNome}
                      </span>{" "}
                      está online.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-600">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Fechando automaticamente...
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
