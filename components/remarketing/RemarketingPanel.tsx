"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  RefreshCw, Trash2, Plus, Settings, Users, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, Clock, CalendarDays, Repeat, UserCheck,
  MessageCircle, TrendingUp,
} from "lucide-react"
import { DelayRangeSlider } from "@/components/campanhas/DelayRangeSlider"
import { IntervalPicker } from "@/components/campanhas/IntervalPicker"

type Template = { id: string; name: string }
type Vendedor = { id: string; nome: string; userId: string }

type Lead = {
  id: string
  userId: string
  number: string
  name: string | null
  currentStep: number
  nextRun: string
  triggeredAt: string
  status: string
  failCount: number
  replied: boolean
  repliedAt: string | null
}

type Config = {
  enabled: boolean
  maxFollowUps: number
  intervalMinutes: number
  minDelaySec: number
  maxDelaySec: number
  maxPerDay: number
  allowedDays: string
  windowStart: string
  windowEnd: string
  timezone: string
  scripts: { templateId: string }[]
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:       { label: "Aguardando",    color: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10" },
  completed:     { label: "Concluído",     color: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10" },
  failed:        { label: "Falhou",        color: "text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10" },
  stop_by_admin: { label: "Parado",        color: "text-slate-500 bg-slate-100 dark:text-slate-400 dark:bg-white/5" },
}

type Props = {
  templates: Template[]
  vendedores: Vendedor[]
}

export function RemarketingPanel({ templates, vendedores }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>(vendedores[0]?.userId ?? "")
  const [config, setConfig] = useState<Config>({
    enabled: false,
    maxFollowUps: 3,
    intervalMinutes: 1440,
    minDelaySec: 15,
    maxDelaySec: 45,
    maxPerDay: 0,
    allowedDays: "1,2,3,4,5",
    windowStart: "09:00",
    windowEnd: "18:00",
    timezone: "America/Campo_Grande",
    scripts: [],
  })
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [stopError, setStopError] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Fetch config + leads when userId changes
  const fetchData = useCallback(async (userId: string) => {
    if (!userId) return
    setLoading(true)
    try {
      const [cfgRes, leadsRes] = await Promise.all([
        fetch(`/api/remarketing/config/${userId}`),
        fetch(`/api/remarketing/leads?userId=${userId}`),
      ])
      if (cfgRes.ok) {
        const data = await cfgRes.json() as Config
        setConfig({
          enabled: data.enabled,
          maxFollowUps: data.maxFollowUps,
          intervalMinutes: data.intervalMinutes,
          minDelaySec: data.minDelaySec ?? 15,
          maxDelaySec: data.maxDelaySec ?? 45,
          maxPerDay: data.maxPerDay ?? 0,
          allowedDays: data.allowedDays,
          windowStart: data.windowStart,
          windowEnd: data.windowEnd,
          timezone: data.timezone,
          scripts: Array.isArray(data.scripts) ? data.scripts as { templateId: string }[] : [],
        })
      }
      if (leadsRes.ok) setLeads(await leadsRes.json() as Lead[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(selectedUserId)
  }, [selectedUserId, fetchData])

  const saveConfig = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/remarketing/config/${selectedUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setSaveError(body.error ?? `Erro ${res.status} ao salvar`)
      }
    } catch {
      setSaveError("Erro de conexão ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const stopLead = async (id: string) => {
    setDeletingId(id)
    setStopError(null)
    try {
      const res = await fetch(
        `/api/remarketing/leads/${id}?userId=${encodeURIComponent(selectedUserId)}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setStopError(body.error ?? `Erro ${res.status} ao parar lead`)
        return
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "stop_by_admin" } : l))
      )
    } catch {
      setStopError("Erro de conexão ao parar lead")
    } finally {
      setDeletingId(null)
    }
  }

  const toggleDay = (d: string) => {
    const days = config.allowedDays.split(",").filter(Boolean)
    const updated = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
    updated.sort((a, b) => Number(a) - Number(b))
    setConfig((c) => ({ ...c, allowedDays: updated.join(",") }))
  }

  const updateScript = (index: number, templateId: string) => {
    const scripts = [...config.scripts]
    scripts[index] = { templateId }
    setConfig((c) => ({ ...c, scripts }))
  }

  const addScript = () => {
    if (config.scripts.length >= config.maxFollowUps) return
    setConfig((c) => ({ ...c, scripts: [...c.scripts, { templateId: "" }] }))
  }

  const removeScript = (index: number) => {
    setConfig((c) => ({ ...c, scripts: c.scripts.filter((_, i) => i !== index) }))
  }

  const activeDays = config.allowedDays.split(",").filter(Boolean)
  const pendingLeads = leads.filter((l) => l.status === "pending").length
  const repliedLeads = leads.filter((l) => l.replied).length
  const sentLeads = leads.filter((l) => l.status !== "pending").length
  const responseRate = sentLeads > 0 ? Math.round((repliedLeads / sentLeads) * 100) : 0

  if (vendedores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-14 flex flex-col items-center gap-4 text-center">
        <Repeat className="w-8 h-8 text-slate-300 dark:text-slate-700" />
        <p className="font-semibold text-slate-900 dark:text-white">Nenhuma instância cadastrada</p>
        <p className="text-sm text-slate-500">Crie uma instância em <strong>Instâncias</strong> para configurar o remarketing.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Instance selector + status bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 block">
            Instância
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full sm:w-64 text-sm bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all"
          >
            {vendedores.map((v) => (
              <option key={v.userId} value={v.userId}>
                {v.nome} ({v.userId})
              </option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-4 sm:mt-0 flex-wrap">
          <StatChip icon={<Users className="w-3.5 h-3.5" />} label="Em andamento" value={pendingLeads} color="violet" />
          <StatChip icon={<UserCheck className="w-3.5 h-3.5" />} label="Total" value={leads.length} color="slate" />
          {repliedLeads > 0 && (
            <StatChip icon={<MessageCircle className="w-3.5 h-3.5" />} label="Responderam" value={repliedLeads} color="emerald" />
          )}
          {sentLeads > 0 && (
            <StatChip icon={<TrendingUp className="w-3.5 h-3.5" />} label="Taxa" value={responseRate} color="amber" suffix="%" />
          )}
          <button
            onClick={() => fetchData(selectedUserId)}
            disabled={loading}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Config panel */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setConfigOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-violet-500" />
            <span className="font-semibold text-sm text-slate-900 dark:text-white">Configuração do Follow-Up</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Enable toggle */}
            <div
              role="switch"
              aria-checked={config.enabled}
              onClick={(e) => {
                e.stopPropagation()
                setConfig((c) => ({ ...c, enabled: !c.enabled }))
              }}
              className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none"
            >
              {config.enabled ? (
                <ToggleRight className="w-6 h-6 text-violet-500" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-slate-400" />
              )}
              <span className={config.enabled ? "text-violet-600 dark:text-violet-400" : "text-slate-400"}>
                {config.enabled ? "Ativo" : "Inativo"}
              </span>
            </div>
            {configOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {configOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-1 space-y-5 border-t border-slate-100 dark:border-white/5">
                {/* Row 1: maxFollowUps + intervalMinutes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Máx. Follow-Ups" icon={<Repeat className="w-3.5 h-3.5" />}>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={config.maxFollowUps}
                      onChange={(e) => setConfig((c) => ({ ...c, maxFollowUps: Number(e.target.value) }))}
                      className="field-input"
                    />
                  </FieldGroup>
                  <FieldGroup label="Intervalo entre follow-ups do mesmo contato" icon={<Clock className="w-3.5 h-3.5" />}>
                    <IntervalPicker
                      value={config.intervalMinutes}
                      onChange={(mins) => setConfig((c) => ({ ...c, intervalMinutes: mins }))}
                    />
                  </FieldGroup>
                </div>

                {/* Row 1b: delay anti-ban entre contatos diferentes */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    Delay entre contatos diferentes (anti-ban)
                  </div>
                  <DelayRangeSlider
                    value={[config.minDelaySec, config.maxDelaySec]}
                    onChange={([lo, hi]) => setConfig((c) => ({ ...c, minDelaySec: lo, maxDelaySec: hi }))}
                  />
                </div>

                {/* Row 1c: daily limit */}
                <FieldGroup label="Limite diário de disparos (0 = sem limite)" icon={<TrendingUp className="w-3.5 h-3.5" />}>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={config.maxPerDay}
                      onChange={(e) => setConfig((c) => ({ ...c, maxPerDay: Math.max(0, Number(e.target.value)) }))}
                      className="field-input w-28"
                    />
                    <span className="text-xs text-slate-400 shrink-0">
                      {config.maxPerDay === 0 ? "sem limite" : "disparos/dia"}
                    </span>
                  </div>
                </FieldGroup>

                {/* Row 2: windowStart + windowEnd */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldGroup label="Janela — Início" icon={<Clock className="w-3.5 h-3.5" />}>
                    <input
                      type="time"
                      value={config.windowStart}
                      onChange={(e) => setConfig((c) => ({ ...c, windowStart: e.target.value }))}
                      className="field-input"
                    />
                  </FieldGroup>
                  <FieldGroup label="Janela — Fim" icon={<Clock className="w-3.5 h-3.5" />}>
                    <input
                      type="time"
                      value={config.windowEnd}
                      onChange={(e) => setConfig((c) => ({ ...c, windowEnd: e.target.value }))}
                      className="field-input"
                    />
                  </FieldGroup>
                </div>

                {/* Row 3: Days */}
                <FieldGroup label="Dias permitidos" icon={<CalendarDays className="w-3.5 h-3.5" />}>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DAY_OPTIONS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          activeDays.includes(d.value)
                            ? "bg-violet-600 text-white"
                            : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </FieldGroup>

                {/* Row 4: Scripts (follow-up sequence) */}
                <FieldGroup label="Sequência de scripts" icon={<Repeat className="w-3.5 h-3.5" />}>
                  <div className="space-y-2 pt-1">
                    {config.scripts.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-14 shrink-0">Passo {i + 1}</span>
                        <select
                          value={s.templateId}
                          onChange={(e) => updateScript(i, e.target.value)}
                          className="flex-1 text-sm bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all"
                        >
                          <option value="">— Selecionar script —</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeScript(i)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {config.scripts.length < config.maxFollowUps && (
                      <button
                        onClick={addScript}
                        className="flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Adicionar passo
                      </button>
                    )}
                  </div>
                </FieldGroup>

                {/* Save */}
                <div className="flex flex-col items-end gap-2">
                  {saveError && (
                    <p className="text-xs text-rose-500 dark:text-rose-400">{saveError}</p>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={saveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-60"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                    Salvar configuração
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Leads table */}
      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            <span className="font-semibold text-sm text-slate-900 dark:text-white">
              Leads em remarketing
            </span>
            <span className="text-xs text-slate-400">({leads.length})</span>
          </div>
          {stopError && (
            <p className="text-xs text-rose-500 dark:text-rose-400">{stopError}</p>
          )}
        </div>

        {leads.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">Nenhum lead em remarketing ainda.</p>
            <p className="text-xs text-slate-400 mt-1">
              Leads são adicionados via API: <code className="font-mono">POST /api/remarketing/leads</code>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Número</th>
                  <th className="text-left px-5 py-3 hidden sm:table-cell">Nome</th>
                  <th className="text-left px-5 py-3">Passo</th>
                  <th className="text-left px-5 py-3 hidden md:table-cell">Próximo envio</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3 hidden lg:table-cell">Resposta</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                <AnimatePresence>
                  {leads.map((lead) => {
                    const s = STATUS_LABELS[lead.status] ?? { label: lead.status, color: "text-slate-400" }
                    return (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {lead.number}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400 hidden sm:table-cell">
                          {lead.name ?? "—"}
                        </td>
                        <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                          {lead.currentStep}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs hidden md:table-cell">
                          {new Date(lead.nextRun).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                            {s.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden lg:table-cell">
                          {lead.replied ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              <MessageCircle className="w-3 h-3" />
                              Respondeu
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {lead.status === "pending" && (
                            <button
                              onClick={() => stopLead(lead.id)}
                              disabled={deletingId === lead.id}
                              className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              title="Parar lead"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatChip({
  icon, label, value, color, suffix = "",
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: "violet" | "slate" | "emerald" | "amber"
  suffix?: string
}) {
  const cls = {
    violet: "bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400",
    slate:  "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400",
    emerald:"bg-emerald-50 dark:bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
    amber:  "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400",
  }[color]
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ${cls}`}>
      {icon}
      <span>{value}{suffix} {label}</span>
    </div>
  )
}

function FieldGroup({
  label, icon, children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

