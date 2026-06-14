"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X, Repeat, Layers, Plus, ChevronDown, AlertCircle, CheckCircle2,
} from "lucide-react"
import { DelayRangeSlider } from "./DelayRangeSlider"
import { IntervalPicker } from "./IntervalPicker"

type Template = { id: string; name: string; _count?: { steps: number } }

type RemarketingQuickConfig = {
  scripts: { templateId: string }[]
  intervalMinutes: number
  maxPerDay: number
  allowedDays: string
  minDelaySec: number
  maxDelaySec: number
}

type Props = {
  templates: Template[]
  vendedorUserId: string
  onSave: (cfg: RemarketingQuickConfig) => void
  onClose: () => void
}

const DAY_OPTIONS = [
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
  { value: "7", label: "Dom" },
]

export function RemarketingQuickModal({ templates, vendedorUserId, onSave, onClose }: Props) {
  const [scripts, setScripts] = useState<{ templateId: string }[]>([])
  const [intervalMinutes, setIntervalMinutes] = useState(1440)
  const [maxPerDay, setMaxPerDay] = useState(0)
  const [allowedDays, setAllowedDays] = useState("1,2,3,4,5")
  const [delay, setDelay] = useState<[number, number]>([15, 45])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load existing config for this vendedor
  useEffect(() => {
    if (!vendedorUserId) { setLoading(false); return }
    fetch(`/api/remarketing/config/${vendedorUserId}`)
      .then((r) => r.json())
      .then((data: RemarketingQuickConfig & { scripts?: { templateId: string }[] }) => {
        if (Array.isArray(data.scripts) && data.scripts.length > 0) setScripts(data.scripts)
        if (data.intervalMinutes) setIntervalMinutes(data.intervalMinutes)
        if (data.maxPerDay !== undefined) setMaxPerDay(data.maxPerDay)
        if (data.allowedDays) setAllowedDays(data.allowedDays)
        if (data.minDelaySec !== undefined && data.maxDelaySec !== undefined) {
          setDelay([data.minDelaySec, data.maxDelaySec])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [vendedorUserId])

  const toggleDay = (d: string) => {
    const days = allowedDays.split(",").filter(Boolean)
    const updated = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
    updated.sort((a, b) => Number(a) - Number(b))
    setAllowedDays(updated.join(",") || "1")
  }

  const activeDays = allowedDays.split(",").filter(Boolean)
  const hasEmptyScript = scripts.some((s) => !s.templateId)
  const canSave = scripts.length > 0 && !hasEmptyScript

  const handleSave = () => {
    if (!canSave) {
      setError("Adicione pelo menos um script e preencha todos os campos.")
      return
    }
    onSave({
      scripts,
      intervalMinutes,
      maxPerDay,
      allowedDays,
      minDelaySec: delay[0],
      maxDelaySec: delay[1],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0b0f19] rounded-xl shadow-xl border border-slate-200 dark:border-white/[0.06]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-600/15 flex items-center justify-center">
              <Repeat className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Configurar Remarketing</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Para contatos que não responderem</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Scripts / Follow-up sequence */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Sequência de Follow-ups
                <span className="text-rose-500">*</span>
              </label>
              <p className="text-[11px] text-slate-400 -mt-1">
                Cada script será enviado em ordem. O intervalo entre eles é configurado abaixo.
              </p>

              {scripts.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 w-5 text-right shrink-0">{idx + 1}</span>
                  <div className="relative flex-1">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-600 pointer-events-none" />
                    <select
                      value={s.templateId}
                      onChange={(e) => {
                        const updated = [...scripts]
                        updated[idx] = { templateId: e.target.value }
                        setScripts(updated)
                      }}
                      className="w-full appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl py-2.5 pl-9 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-400">
                        Selecione um script...
                      </option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                          {t.name}{t._count ? ` · ${t._count.steps} passo${t._count.steps !== 1 ? "s" : ""}` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setScripts((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setScripts((prev) => [...prev, { templateId: "" }])}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 border-dashed transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {scripts.length === 0 ? "Adicionar Script" : "Adicionar Follow-up"}
              </button>
            </div>

            {/* Interval between follow-ups */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Intervalo entre follow-ups do mesmo contato
              </label>
              <IntervalPicker
                value={intervalMinutes}
                onChange={setIntervalMinutes}
              />
            </div>

            {/* Dias da semana */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Dias permitidos</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_OPTIONS.map((d) => {
                  const active = activeDays.includes(d.value)
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? "bg-violet-600 text-white"
                          : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                      }`}
                    >
                      {d.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Delay anti-ban */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Delay entre contatos (anti-ban)
              </label>
              <DelayRangeSlider value={delay} onChange={setDelay} />
            </div>

            {/* Limite diário */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Limite diário de disparos
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={maxPerDay}
                  onChange={(e) => setMaxPerDay(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all text-center"
                />
                <span className="text-xs text-slate-500">
                  {maxPerDay === 0 ? "sem limite" : `disparos/dia`}
                </span>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3 py-2.5"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.06] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export type { RemarketingQuickConfig }
