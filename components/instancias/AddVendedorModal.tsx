"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Smartphone, CheckCircle2, RefreshCw, AlertCircle, Clock, Wifi, WifiOff, Loader2,
} from "lucide-react"
import type { QrResponse } from "@/app/api/instances/[userId]/qr/route"

type Step = "form" | "connecting" | "success"
type Mode = "add" | "reconnect"

// Fase visual dentro do step "connecting"
type QrPhase =
  | "loading"       // fetch inicial em andamento
  | "initializing"  // API ainda aquecendo (Puppeteer iniciando)
  | "ready"         // QR disponível, fresh
  | "expiring"      // QR com < 10s restantes
  | "refreshing"    // buscando novo QR após expirar ou forçar refresh
  | "error"         // falha de comunicação

type Props = {
  mode?: Mode
  vendedor?: { nome: string; userId: string }
  onClose: () => void
  onSuccess: (vendedor: { id: string; nome: string; userId: string }) => void
}

const QR_LIFETIME_S = 30
const EXPIRING_THRESHOLD_S = 10
const INIT_RETRY_INTERVAL_MS = 4_000  // enquanto "initializing", tenta a cada 4s
const STATUS_POLL_INTERVAL_MS = 2_000 // verifica conexão a cada 2s

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

function clearRef(ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>) {
  if (ref.current !== null) { clearInterval(ref.current); ref.current = null }
}

// ── Countdown bar ──────────────────────────────────────────────────────────────

function CountdownBar({ secs, total }: { secs: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (secs / total) * 100))
  const isExpiring = secs <= EXPIRING_THRESHOLD_S
  return (
    <div className="w-full space-y-1">
      <div className="h-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
        <motion.div
          className={`h-full rounded-full transition-colors duration-1000 ${isExpiring ? "bg-amber-400" : "bg-violet-500"}`}
          style={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: "linear" }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className={`flex items-center gap-1 ${isExpiring ? "text-amber-500 dark:text-amber-400 font-semibold" : "text-slate-400 dark:text-slate-600"}`}>
          <Clock className="w-3 h-3" />
          {isExpiring ? `Expira em ${secs}s` : `Válido por ${secs}s`}
        </span>
        <button
          onClick={() => {/* handled by parent */}}
          data-qr-refresh
          className="flex items-center gap-1 text-slate-400 dark:text-slate-600 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Novo QR
        </button>
      </div>
    </div>
  )
}

// ── Phase label ────────────────────────────────────────────────────────────────

const PHASE_CFG: Record<QrPhase, { label: string; sub: string; icon: React.ElementType; iconCls: string }> = {
  loading:      { label: "Conectando à API...",      sub: "Verificando estado da instância",          icon: Loader2,     iconCls: "text-slate-400 animate-spin" },
  initializing: { label: "Inicializando WhatsApp",   sub: "O WhatsApp está abrindo, aguarde...",      icon: Loader2,     iconCls: "text-violet-500 animate-spin" },
  ready:        { label: "Escaneie o QR Code",       sub: "WhatsApp → Dispositivos vinculados → Vincular dispositivo", icon: Smartphone, iconCls: "text-violet-500" },
  expiring:     { label: "QR expirando!",            sub: "Escaneie agora ou um novo será gerado",    icon: Clock,       iconCls: "text-amber-500" },
  refreshing:   { label: "Renovando QR Code...",     sub: "Gerando um novo código de acesso",         icon: RefreshCw,   iconCls: "text-violet-400 animate-spin" },
  error:        { label: "Falha de comunicação",     sub: "Não foi possível obter o QR Code",         icon: WifiOff,     iconCls: "text-rose-400" },
}

// ── Dot pulser ─────────────────────────────────────────────────────────────────

function ConnDot({ phase }: { phase: QrPhase }) {
  const pulse = phase !== "error" && phase !== "loading"
  const color =
    phase === "error"      ? "bg-rose-500" :
    phase === "expiring"   ? "bg-amber-400" :
    phase === "ready"      ? "bg-emerald-500" :
    "bg-violet-500"

  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      {pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />}
      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${color}`} />
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AddVendedorModal({ mode = "add", vendedor, onClose, onSuccess }: Props) {
  const [step, setStep]   = useState<Step>(mode === "reconnect" ? "connecting" : "form")
  const [nome, setNome]   = useState(vendedor?.nome ?? "")
  const [userId, setUserId] = useState(vendedor?.userId ?? "")
  const [userIdManual, setUserIdManual] = useState(false)
  const [formError, setFormError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [qrPhase, setQrPhase]   = useState<QrPhase>("loading")
  const [qrCountdown, setQrCountdown] = useState(QR_LIFETIME_S)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [initAttempts, setInitAttempts] = useState(0)

  const [currentUserId, setCurrentUserId] = useState(vendedor?.userId ?? "")
  const [currentNome, setCurrentNome]     = useState(vendedor?.nome ?? "")

  const mountedRef      = useRef(true)
  const fetchingRef     = useRef(false)
  const statusIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearRef(statusIntervalRef)
      clearRef(countdownIntervalRef)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!userIdManual && mode === "add") setUserId(slugify(nome))
  }, [nome, userIdManual, mode])

  // ── goSuccess ────────────────────────────────────────────────────────────────

  const goSuccess = useCallback(() => {
    clearRef(statusIntervalRef)
    clearRef(countdownIntervalRef)
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null }
    setStep("success")
  }, [])

  // ── Status polling (detecta conexão sem precisar do QR) ──────────────────────

  const startStatusPoll = useCallback((uid: string) => {
    clearRef(statusIntervalRef)
    statusIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return
      try {
        const res = await fetch(`/api/instances/${uid}/status`, { cache: "no-store" })
        if (!res.ok || !mountedRef.current) return
        const data = (await res.json()) as { state?: string }
        if (data.state === "open" && mountedRef.current) goSuccess()
      } catch {}
    }, STATUS_POLL_INTERVAL_MS)
  }, [goSuccess])

  // ── startCountdown ────────────────────────────────────────────────────────────

  const startCountdown = useCallback((uid: string, onExpire: () => void) => {
    clearRef(countdownIntervalRef)
    setQrCountdown(QR_LIFETIME_S)
    countdownIntervalRef.current = setInterval(() => {
      setQrCountdown((c) => {
        const next = c - 1
        if (next <= EXPIRING_THRESHOLD_S) setQrPhase("expiring")
        if (next <= 0) {
          clearRef(countdownIntervalRef)
          onExpire()
          return QR_LIFETIME_S
        }
        return next
      })
    }, 1_000)
    void uid
  }, [])

  // ── fetchQR ───────────────────────────────────────────────────────────────────

  const fetchQR = useCallback(async (uid: string, isRefresh = false) => {
    if (!mountedRef.current || fetchingRef.current) return
    fetchingRef.current = true

    setQrPhase(isRefresh ? "refreshing" : "loading")
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/instances/${uid}/qr`, { cache: "no-store" })
      const data = (await res.json()) as QrResponse
      if (!mountedRef.current) return

      if (data.phase === "already_connected") {
        goSuccess(); return
      }

      if (data.phase === "qr_available") {
        setQrBase64(data.base64)
        setQrPhase("ready")
        setInitAttempts(0)
        startCountdown(uid, () => {
          if (mountedRef.current) fetchQR(uid, true)
        })
        return
      }

      if (data.phase === "initializing") {
        setQrBase64(null)
        setQrPhase("initializing")
        setInitAttempts((n) => n + 1)
        // Retenta automaticamente após INIT_RETRY_INTERVAL_MS
        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) fetchQR(uid, false)
        }, INIT_RETRY_INTERVAL_MS)
        return
      }

      if (data.phase === "error") {
        setQrPhase("error")
        setErrorMsg(data.message ?? "Erro desconhecido.")
        return
      }
    } catch {
      if (mountedRef.current) {
        setQrPhase("error")
        setErrorMsg("Sem resposta do servidor. Verifique a conexão.")
      }
    } finally {
      fetchingRef.current = false
    }
  }, [goSuccess, startCountdown])

  // ── Forçar refresh manual ────────────────────────────────────────────────────

  const handleManualRefresh = useCallback(() => {
    clearRef(countdownIntervalRef)
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null }
    fetchingRef.current = false
    fetchQR(currentUserId, true)
  }, [fetchQR, currentUserId])

  // ── Entrar em "connecting" ────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== "connecting" || !currentUserId) return
    const uid = currentUserId
    fetchQR(uid, false)
    startStatusPoll(uid)
    return () => {
      clearRef(statusIntervalRef)
      clearRef(countdownIntervalRef)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentUserId])

  // ── Success auto-close ───────────────────────────────────────────────────────

  useEffect(() => {
    if (step !== "success") return
    const t = setTimeout(
      () => onSuccess({ id: currentUserId, nome: currentNome, userId: currentUserId }),
      2_000
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
      if (!res.ok) { setFormError(data.error ?? "Erro ao criar instância."); return }
      setCurrentUserId(userId)
      setCurrentNome(nome)
      setStep("connecting")
    } catch {
      setFormError("Erro de conexão. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const phaseCfg = PHASE_CFG[qrPhase]
  const PhaseIcon = phaseCfg.icon

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
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white dark:bg-[#0c1018] border border-slate-200 dark:border-white/[0.07] shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-600/20 flex items-center justify-center">
                <Smartphone className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">
                {mode === "reconnect" ? `Reconectar — ${vendedor?.nome}` : "Adicionar Instância"}
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            <AnimatePresence mode="wait">

              {/* ── STEP: Form ─────────────────────────────────────────────── */}
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
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nome do Vendedor</label>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: João Silva"
                      required
                      autoFocus
                      className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white dark:focus:bg-white/[0.07] transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      ID Único{" "}
                      <span className="font-normal text-slate-400 dark:text-slate-600">(gerado automaticamente)</span>
                    </label>
                    <input
                      value={userId}
                      onChange={(e) => { setUserIdManual(true); setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")) }}
                      placeholder="joao_silva"
                      required
                      className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-white dark:focus:bg-white/[0.07] transition-all"
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
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors"
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

              {/* ── STEP: QR ──────────────────────────────────────────────── */}
              {step === "connecting" && (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="flex flex-col items-center gap-5"
                >
                  {/* Phase label */}
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <PhaseIcon className={`w-4 h-4 ${phaseCfg.iconCls}`} />
                      <p className={`text-sm font-semibold ${qrPhase === "expiring" ? "text-amber-600 dark:text-amber-400" : qrPhase === "error" ? "text-rose-500" : "text-slate-900 dark:text-white"}`}>
                        {phaseCfg.label}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-500">{phaseCfg.sub}</p>
                    {qrPhase === "initializing" && initAttempts > 0 && (
                      <p className="text-[10px] text-violet-400 dark:text-violet-500">
                        Tentativa {initAttempts} — próxima em {INIT_RETRY_INTERVAL_MS / 1000}s...
                      </p>
                    )}
                  </div>

                  {/* QR frame */}
                  <div className={`relative w-56 h-56 rounded-2xl overflow-hidden bg-white flex items-center justify-center transition-all duration-300 ${
                    qrPhase === "expiring"
                      ? "ring-2 ring-amber-400 shadow-lg shadow-amber-500/20"
                      : qrPhase === "error"
                      ? "ring-2 ring-rose-300 dark:ring-rose-500/40"
                      : "ring-1 ring-black/5 shadow-md"
                  }`}>
                    <AnimatePresence mode="wait">
                      {/* QR image */}
                      {(qrPhase === "ready" || qrPhase === "expiring") && qrBase64 && (
                        <motion.img
                          key={qrBase64.slice(-20)}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          src={qrBase64}
                          alt="QR Code WhatsApp"
                          width={208}
                          height={208}
                          className="w-full h-full object-contain p-2"
                        />
                      )}

                      {/* Refreshing overlay */}
                      {qrPhase === "refreshing" && qrBase64 && (
                        <motion.div
                          key="refreshing"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90"
                        >
                          <div className="w-8 h-8 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                          <p className="text-xs text-slate-500">Renovando QR...</p>
                        </motion.div>
                      )}

                      {/* Loading / initializing state */}
                      {(qrPhase === "loading" || (qrPhase === "initializing" && !qrBase64) || (qrPhase === "refreshing" && !qrBase64)) && (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center gap-4 px-6 text-center"
                        >
                          <div className="relative">
                            <div className="w-14 h-14 rounded-full border-2 border-violet-100 border-t-violet-500 animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Smartphone className="w-5 h-5 text-violet-400" />
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-700">
                              {qrPhase === "loading" ? "Conectando..." : "Abrindo WhatsApp"}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {qrPhase === "initializing"
                                ? "Isso pode levar até 30 segundos"
                                : "Aguarde..."}
                            </p>
                          </div>
                        </motion.div>
                      )}

                      {/* Error state */}
                      {qrPhase === "error" && (
                        <motion.div
                          key="error"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center gap-3 px-5 text-center"
                        >
                          <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                            <AlertCircle className="w-5 h-5 text-rose-400" />
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed">{errorMsg}</p>
                          <button
                            onClick={handleManualRefresh}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Tentar novamente
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Countdown bar — só quando QR visível */}
                  <AnimatePresence>
                    {(qrPhase === "ready" || qrPhase === "expiring") && (
                      <motion.div
                        key="countdown"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="w-full"
                        onClick={(e) => {
                          const el = e.currentTarget.querySelector("[data-qr-refresh]") as HTMLElement | null
                          if (el && (e.target as HTMLElement).closest("[data-qr-refresh]")) handleManualRefresh()
                        }}
                      >
                        <CountdownBar secs={qrCountdown} total={QR_LIFETIME_S} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Status strip */}
                  <div className="w-full flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-600 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <div className="flex items-center gap-1.5">
                      <ConnDot phase={qrPhase} />
                      <span>
                        {qrPhase === "ready" || qrPhase === "expiring" ? "Aguardando scan" :
                         qrPhase === "initializing" ? "Inicializando instância" :
                         qrPhase === "error" ? "Sem conexão" :
                         "Verificando..."}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(qrPhase === "ready" || qrPhase === "expiring" || qrPhase === "error") && (
                        <button
                          onClick={handleManualRefresh}
                          className="flex items-center gap-1 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Atualizar
                        </button>
                      )}
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" />
                        status a cada 2s
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={onClose}
                    className="text-xs text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors -mt-1"
                  >
                    Fechar e continuar depois
                  </button>
                </motion.div>
              )}

              {/* ── STEP: Success ────────────────────────────────────────── */}
              {step === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.92 }}
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
                    <p className="font-semibold text-slate-900 dark:text-white">Conectado com sucesso!</p>
                    <p className="text-sm text-slate-500 mt-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{currentNome}</span> está online.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
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
