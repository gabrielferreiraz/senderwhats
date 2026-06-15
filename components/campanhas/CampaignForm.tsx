"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Loader2,
  Play,
  Save,
  ChevronDown,
  Users,
  Layers,
  Smartphone,
  FolderOpen,
  PenLine,
  CalendarClock,
  Clock,
  MessageSquare,
  AlertCircle,
  Plus,
  X,
  CheckCircle2,
  RotateCcw,
  Repeat,
  Settings2,
} from "lucide-react"
import { parsePhones } from "@/lib/phone"
import { DelayRangeSlider } from "./DelayRangeSlider"
import { ScheduleRuleBuilder, ScheduleRule, flattenRules } from "./ScheduleRuleBuilder"
import { IntervalPicker } from "./IntervalPicker"

type Vendedor = { id: string; nome: string; userId: string }
type ContactList = { id: string; name: string; _count: { items: number } }
type Template = { id: string; name: string; _count: { steps: number } }

type ContactMode = "list" | "manual"
type DispatchMode = "now" | "scheduled"
type AbEntry = { id: string; weight: number }

type InitialData = {
  name: string
  vendedorId: string
  listId: string | null
  templateId: string | null
  templates: AbEntry[] | null
  customMessage: string | null
  minDelay: number
  maxDelay: number
  enableRemarketing: boolean
  rmktScripts: { templateId: string }[]
  rmktIntervalMinutes: number
  rmktWindowStart: string
  rmktWindowEnd: string
  rmktAllowedDays: string
  rmktMaxPerDay: number
  maxSendsPerDay: number
  scheduleRules: ScheduleRule[]
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

type Props = {
  vendedores: Vendedor[]
  lists: ContactList[]
  templates: Template[]
  /** When provided the form operates in edit mode (PUT instead of POST) */
  campaignId?: string
  initialData?: InitialData
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
}: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  icon?: React.ElementType
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-600 pointer-events-none" />
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl py-2.5 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all ${
          Icon ? "pl-10" : "pl-4"
        }`}
      >
        {placeholder && (
          <option value="" className="bg-white dark:bg-slate-900 text-slate-400">
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    </div>
  )
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function countManualNumbers(text: string): number {
  return parsePhones(text).length
}

// ─── NumInput ─────────────────────────────────────────────────────────────────
// Controlled number input that allows temporarily clearing the field.
// Commits clamped value on blur; syncs display when parent resets the value.

function NumInput({
  value,
  onChange,
  min = 0,
  max,
  className,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  className?: string
}) {
  const [raw, setRaw] = useState(String(value))
  const lastProp = useRef(value)

  // Sync display when parent changes value externally (e.g. form reset)
  if (value !== lastProp.current) {
    lastProp.current = value
    setRaw(String(value))
  }

  const commit = (str: string) => {
    const n = parseInt(str, 10)
    const safe = isNaN(n) ? min : Math.max(min, max !== undefined ? Math.min(max, n) : n)
    lastProp.current = safe
    setRaw(String(safe))
    onChange(safe)
  }

  return (
    <input
      type="number"
      value={raw}
      min={min}
      max={max}
      className={className}
      onChange={(e) => {
        setRaw(e.target.value)
        const n = parseInt(e.target.value, 10)
        if (!isNaN(n)) {
          const safe = Math.max(min, max !== undefined ? Math.min(max, n) : n)
          lastProp.current = safe
          onChange(safe)
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  )
}

// ─── A/B weight helpers ───────────────────────────────────────────────────────

function distributeEvenly(n: number): number[] {
  if (n === 0) return []
  const base = Math.floor(100 / n)
  const rem = 100 - base * n
  return Array.from({ length: n }, (_, i) => (i < rem ? base + 1 : base))
}

// ─── Draft persistence ────────────────────────────────────────────────────────

const CAMPAIGN_DRAFT_KEY = "campaign_nova_draft"

function readDraft(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(CAMPAIGN_DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch { return null }
}

function writeDraft(data: Record<string, unknown>): void {
  try { localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(data)) } catch {}
}

function clearDraft(): void {
  try { localStorage.removeItem(CAMPAIGN_DRAFT_KEY) } catch {}
}

export function CampaignForm({ vendedores, lists, templates, campaignId, initialData }: Props) {
  const router = useRouter()
  const isEdit = !!campaignId

  // Resolve initial A/B templates from initialData
  const initAbTemplates = (): AbEntry[] => {
    if (!initialData) return []
    if (initialData.templates?.length) return initialData.templates
    if (initialData.templateId) return [{ id: initialData.templateId, weight: 100 }]
    return []
  }

  const [name, setName] = useState(() => initialData?.name ?? "")
  const [vendedorId, setVendedorId] = useState(() => initialData?.vendedorId ?? "")
  const [contactMode, setContactMode] = useState<ContactMode>("list")
  const [listId, setListId] = useState(() => initialData?.listId ?? "")
  const [manualNumbers, setManualNumbers] = useState("")
  // A/B scripts: each entry is a script + its % weight
  const [abTemplates, setAbTemplates] = useState<AbEntry[]>(initAbTemplates)
  const [customMessage, setCustomMessage] = useState(() => initialData?.customMessage ?? "")
  const [delay, setDelay] = useState<[number, number]>(() =>
    initialData ? [initialData.minDelay, initialData.maxDelay] : [15, 45]
  )
  const [enableRemarketing, setEnableRemarketing] = useState(() => initialData?.enableRemarketing ?? false)
  const [rmktScripts, setRmktScripts] = useState<{ templateId: string }[]>(() => initialData?.rmktScripts ?? [])
  const [rmktIntervalMinutes, setRmktIntervalMinutes] = useState(() => initialData?.rmktIntervalMinutes ?? 1440)
  const [rmktWindowStart, setRmktWindowStart] = useState(() => initialData?.rmktWindowStart ?? "09:00")
  const [rmktWindowEnd, setRmktWindowEnd] = useState(() => initialData?.rmktWindowEnd ?? "18:00")
  const [rmktAllowedDays, setRmktAllowedDays] = useState(() => initialData?.rmktAllowedDays ?? "1,2,3,4,5")
  const [rmktMaxPerDay, setRmktMaxPerDay] = useState(() => initialData?.rmktMaxPerDay ?? 0)
  const [maxSendsPerDay, setMaxSendsPerDay] = useState(() => initialData?.maxSendsPerDay ?? 0)
  const [rules, setRules] = useState<ScheduleRule[]>(() => initialData?.scheduleRules ?? [])
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("now")
  const [schedDate, setSchedDate] = useState("")
  const [schedTime, setSchedTime] = useState("")
  const [submitting, setSubmitting] = useState<"draft" | "start" | "schedule" | null>(null)
  const [error, setError] = useState("")
  const [draftRestored, setDraftRestored] = useState(false)
  const loadedRef = useRef(false)

  // Load draft on mount; autosave on every subsequent change (skipped in edit mode)
  useEffect(() => {
    if (isEdit) return // edit mode uses initialData, not localStorage draft
    if (!loadedRef.current) {
      loadedRef.current = true
      const d = readDraft()
      if (!d) return
      if (typeof d.name === "string") setName(d.name)
      if (d.contactMode === "manual" || d.contactMode === "list") setContactMode(d.contactMode as ContactMode)
      if (typeof d.vendedorId === "string" && vendedores.some((v) => v.id === d.vendedorId)) setVendedorId(d.vendedorId as string)
      if (typeof d.listId === "string" && lists.some((l) => l.id === d.listId)) setListId(d.listId as string)
      if (typeof d.manualNumbers === "string") setManualNumbers(d.manualNumbers as string)
      if (Array.isArray(d.abTemplates)) {
        const valid = (d.abTemplates as AbEntry[]).filter((e) => templates.some((t) => t.id === e.id))
        if (valid.length > 0) setAbTemplates(valid)
      }
      if (typeof d.customMessage === "string") setCustomMessage(d.customMessage as string)
      if (Array.isArray(d.delay) && (d.delay as unknown[]).length === 2) {
        setDelay([Number((d.delay as unknown[])[0]) || 15, Number((d.delay as unknown[])[1]) || 45])
      }
      if (Array.isArray(d.rules)) setRules(d.rules as ScheduleRule[])
      if (typeof d.enableRemarketing === "boolean") setEnableRemarketing(d.enableRemarketing)
      if (Array.isArray(d.rmktScripts)) setRmktScripts(d.rmktScripts as { templateId: string }[])
      if (typeof d.rmktIntervalMinutes === "number") setRmktIntervalMinutes(d.rmktIntervalMinutes as number)
      if (typeof d.rmktWindowStart === "string") setRmktWindowStart(d.rmktWindowStart as string)
      if (typeof d.rmktWindowEnd === "string") setRmktWindowEnd(d.rmktWindowEnd as string)
      if (typeof d.rmktAllowedDays === "string") setRmktAllowedDays(d.rmktAllowedDays as string)
      if (typeof d.rmktMaxPerDay === "number") setRmktMaxPerDay(d.rmktMaxPerDay as number)
      if (typeof d.maxSendsPerDay === "number") setMaxSendsPerDay(d.maxSendsPerDay as number)
      if (d.dispatchMode === "scheduled") setDispatchMode("scheduled")
      if (typeof d.schedDate === "string") setSchedDate(d.schedDate as string)
      if (typeof d.schedTime === "string") setSchedTime(d.schedTime as string)
      setDraftRestored(true)
      return
    }
    // Autosave: skip if nothing meaningful has been entered
    if (!name) { clearDraft(); return }
    writeDraft({ name, vendedorId, contactMode, listId, manualNumbers, abTemplates, customMessage, delay, enableRemarketing, rmktScripts, rmktIntervalMinutes, rmktWindowStart, rmktWindowEnd, rmktAllowedDays, rmktMaxPerDay, maxSendsPerDay, rules, dispatchMode, schedDate, schedTime })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, vendedorId, contactMode, listId, manualNumbers, abTemplates, customMessage, delay, enableRemarketing, rmktScripts, rmktIntervalMinutes, rmktWindowStart, rmktWindowEnd, rmktAllowedDays, rmktMaxPerDay, maxSendsPerDay, rules, dispatchMode, schedDate, schedTime])


  const discardDraft = () => {
    clearDraft()
    setDraftRestored(false)
    setName("")
    setVendedorId("")
    setContactMode("list")
    setListId("")
    setManualNumbers("")
    setAbTemplates([])
    setCustomMessage("")
    setDelay([15, 45])
    setEnableRemarketing(false)
    setRmktScripts([])
    setRmktIntervalMinutes(1440)
    setRmktWindowStart("09:00")
    setRmktWindowEnd("18:00")
    setRmktAllowedDays("1,2,3,4,5")
    setRmktMaxPerDay(0)
    setMaxSendsPerDay(0)
    setRules([])
    setDispatchMode("now")
    setSchedDate("")
    setSchedTime("")
  }

  const selectedList = lists.find((l) => l.id === listId)
  const selectedVendedor = vendedores.find((v) => v.id === vendedorId)
  const manualCount = countManualNumbers(manualNumbers)
  const todayStr = new Date().toISOString().slice(0, 10)

  // A/B weight helpers
  const totalWeight = abTemplates.reduce((s, e) => s + e.weight, 0)
  const weightValid = abTemplates.length <= 1 || totalWeight === 100
  const hasEmptyScript = abTemplates.some((e) => !e.id)

  const addAbTemplate = () =>
    setAbTemplates((prev) => {
      const next = [...prev, { id: "", weight: 0 }]
      const weights = distributeEvenly(next.length)
      return next.map((e, i) => ({ ...e, weight: weights[i]! }))
    })

  const removeAbTemplate = (idx: number) =>
    setAbTemplates((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      if (next.length === 0) return next
      const weights = distributeEvenly(next.length)
      return next.map((e, i) => ({ ...e, weight: weights[i]! }))
    })

  const updateAbTemplate = (idx: number, patch: Partial<AbEntry>) =>
    setAbTemplates((prev) => {
      const updated = prev.map((t, i) => (i === idx ? { ...t, ...patch } : t))
      // Auto-adjust the other side when exactly 2 scripts
      if ("weight" in patch && prev.length === 2) {
        const other = 1 - idx
        updated[other] = { ...updated[other]!, weight: Math.max(0, 100 - (patch.weight ?? 0)) }
      }
      return updated
    })

  const scheduledAt = schedDate && schedTime ? new Date(`${schedDate}T${schedTime}`) : null
  const schedIsPast = scheduledAt !== null && scheduledAt <= new Date()
  const windowInvalid = enableRemarketing && rmktWindowStart >= rmktWindowEnd

  const submit = async (mode: "draft" | "start" | "schedule") => {
    setError("")
    if (!name.trim()) { setError("Informe o nome da campanha."); return }
    if (!vendedorId) { setError("Selecione um vendedor."); return }
    if (!isEdit && contactMode === "manual" && manualCount === 0) {
      setError("Insira pelo menos um número válido.")
      return
    }
    if (abTemplates.length > 0 && hasEmptyScript) {
      setError("Selecione um script para cada linha adicionada.")
      return
    }
    if (abTemplates.length > 1 && totalWeight !== 100) {
      setError("A soma dos pesos deve ser exatamente 100%.")
      return
    }
    if (enableRemarketing && rmktScripts.filter((s) => s.templateId).length === 0) {
      setError("Adicione pelo menos um script de follow-up no remarketing.")
      return
    }
    if (windowInvalid) {
      setError("O horário de início do follow-up deve ser anterior ao horário de fim.")
      return
    }
    if (mode === "schedule") {
      if (!scheduledAt) { setError("Informe a data e hora para agendar."); return }
      if (schedIsPast) { setError("A data/hora de agendamento deve ser no futuro."); return }
    }

    setSubmitting(mode)
    try {
      const validTemplates = abTemplates.filter((e) => e.id)

      // ── Edit mode: PUT existing campaign ──────────────────────────────────
      if (isEdit) {
        const putRes = await fetch(`/api/campaigns/${campaignId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullEdit: true,
            name: name.trim(),
            vendedorId,
            listId: listId || null,
            templates: validTemplates.length > 0 ? validTemplates : undefined,
            customMessage: validTemplates.length === 0 && customMessage.trim() ? customMessage.trim() : undefined,
            minDelay: delay[0],
            maxDelay: delay[1],
            maxSendsPerDay,
            enableRemarketing,
            rmktScripts: rmktScripts.filter((s) => s.templateId),
            rmktIntervalMinutes,
            rmktMaxFollowUps: rmktScripts.filter((s) => s.templateId).length,
            rmktWindowStart,
            rmktWindowEnd,
            rmktAllowedDays,
            rmktMinDelaySec: delay[0],
            rmktMaxDelaySec: delay[1],
            rmktMaxPerDay,
            scheduleRules: flattenRules(rules),
          }),
        })
        const putData: { ok?: boolean; error?: string } = await putRes.json()
        if (!putRes.ok) { setError(putData.error ?? "Erro ao salvar campanha."); return }

        if (mode === "start") {
          const actionRes = await fetch(`/api/campaigns/${campaignId}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "START" }),
          })
          if (!actionRes.ok) {
            const d = await actionRes.json() as { error?: string }
            setError(d.error ?? "Erro ao iniciar campanha.")
            return
          }
          router.push(`/campanhas/${campaignId}`)
        } else if (mode === "schedule") {
          const actionRes = await fetch(`/api/campaigns/${campaignId}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "SCHEDULE", scheduledAt: scheduledAt!.toISOString() }),
          })
          if (!actionRes.ok) {
            const d = await actionRes.json() as { error?: string }
            setError(d.error ?? "Erro ao agendar campanha.")
            return
          }
          router.push("/campanhas")
        } else {
          router.push("/campanhas")
        }
        return
      }

      // ── Create mode: POST new campaign ────────────────────────────────────
      const body: Record<string, unknown> = {
        name: name.trim(),
        vendedorId,
        templates: validTemplates.length > 0 ? validTemplates : undefined,
        customMessage: validTemplates.length === 0 && customMessage.trim() ? customMessage.trim() : undefined,
        minDelay: delay[0],
        maxDelay: delay[1],
        maxSendsPerDay,
        enableRemarketing,
        rmktScripts: rmktScripts.filter((s) => s.templateId),
        rmktIntervalMinutes,
        rmktMaxFollowUps: rmktScripts.filter((s) => s.templateId).length,
        rmktWindowStart,
        rmktWindowEnd,
        rmktAllowedDays,
        rmktMinDelaySec: delay[0],
        rmktMaxDelaySec: delay[1],
        rmktMaxPerDay,
        scheduleRules: flattenRules(rules),
        ...(contactMode === "list"
          ? { listId: listId || undefined }
          : { manualNumbers }),
      }

      if (mode === "schedule") {
        body.scheduledAt = scheduledAt!.toISOString()
      } else {
        body.autoStart = mode === "start"
      }

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data: { id?: string; error?: string } = await res.json()
      if (!res.ok) { setError(data.error ?? "Erro ao criar campanha."); return }

      clearDraft()
      router.push(mode === "start" ? `/campanhas/${data.id}` : "/campanhas")
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/campanhas")}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {isEdit ? "Editar Campanha" : "Nova Campanha"}
        </h1>
      </div>

      {/* Draft restored banner */}
      <AnimatePresence>
        {draftRestored && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-400"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">Rascunho restaurado — seus dados foram recuperados automaticamente.</span>
            <button
              type="button"
              onClick={discardDraft}
              className="text-[11px] underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity shrink-0"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => setDraftRestored(false)}
              className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section 1: Name */}
      <FormSection title="Identificação" description="Nome interno da campanha para organização.">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nome da Campanha</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Promoção de Natal — Clientes Premium"
            autoFocus
            className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/40 transition-all"
          />
        </div>
      </FormSection>

      {/* Section 2: Vendedor + Contatos + Script */}
      <FormSection title="Disparo e Conteúdo" description="Escolha o vendedor, os contatos alvo e o script ou mensagem.">
        <div className="space-y-5">
          {/* Vendedor */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Vendedor <span className="text-rose-500 dark:text-rose-400">*</span>
            </label>
            <Select
              value={vendedorId}
              onChange={setVendedorId}
              icon={Smartphone}
              placeholder="Selecione o vendedor..."
              options={vendedores.map((v) => ({ label: v.nome, value: v.id }))}
            />
            {vendedores.length === 0 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Nenhum vendedor conectado. Conecte um WhatsApp em Instâncias primeiro.
              </p>
            )}
          </div>

          {/* Contact source: tabs */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Contatos Alvo</label>
            {!isEdit && (
              <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setContactMode("list")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    contactMode === "list"
                      ? "bg-violet-600 text-white shadow-md"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Selecionar Lista
                </button>
                <button
                  type="button"
                  onClick={() => setContactMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    contactMode === "manual"
                      ? "bg-violet-600 text-white shadow-md"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Digitar Números
                </button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {contactMode === "list" ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-1.5"
                >
                  <Select
                    value={listId}
                    onChange={setListId}
                    icon={Users}
                    placeholder="Sem lista (campanha vazia)"
                    options={lists.map((l) => ({
                      label: `${l.name} · ${l._count.items.toLocaleString()} contatos`,
                      value: l.id,
                    }))}
                  />
                  {selectedList && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {selectedList._count.items.toLocaleString()} contatos serão enfileirados
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="manual"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-1.5"
                >
                  <textarea
                    value={manualNumbers}
                    onChange={(e) => setManualNumbers(e.target.value)}
                    rows={5}
                    placeholder={`Cole os números separados por vírgula, espaço ou Enter.\n\nEx:\n5511999999999\n5521988888888, 5531977777777`}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/40 transition-all resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-500 dark:text-slate-600">
                      Prefixo <span className="font-mono">55</span> adicionado automaticamente.
                    </p>
                    {manualCount > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                        {manualCount} número{manualCount !== 1 ? "s" : ""} detectado{manualCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scripts A/B */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Conteúdo das Mensagens
              </label>
              {abTemplates.length > 1 && (
                <span className={`text-[10px] font-medium flex items-center gap-1 ${weightValid ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
                  {weightValid
                    ? <CheckCircle2 className="w-3 h-3" />
                    : <AlertCircle className="w-3 h-3" />}
                  Soma: {totalWeight}%
                </span>
              )}
            </div>

            {/* Script rows */}
            {abTemplates.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* Script select */}
                <div className="relative flex-1">
                  <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 dark:text-slate-600 pointer-events-none" />
                  <select
                    value={entry.id}
                    onChange={(e) => updateAbTemplate(idx, { id: e.target.value })}
                    className="w-full appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl py-2.5 pl-10 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all"
                  >
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-400">
                      Selecione um script...
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                        {t.name} · {t._count.steps} passo{t._count.steps !== 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                </div>

                {/* Weight % */}
                <div className="relative w-20 shrink-0">
                  <NumInput
                    value={entry.weight}
                    onChange={(n) => updateAbTemplate(idx, { weight: n })}
                    min={0}
                    max={100}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl py-2.5 pl-3 pr-6 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all text-center"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    %
                  </span>
                </div>

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeAbTemplate(idx)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0"
                  title="Remover script"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Weight error */}
            <AnimatePresence>
              {abTemplates.length > 1 && !weightValid && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-[11px] text-rose-500 dark:text-rose-400"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  A soma dos pesos deve ser exatamente 100%
                </motion.div>
              )}
            </AnimatePresence>

            {/* Add script button */}
            {templates.length > 0 && abTemplates.length < templates.length && (
              <button
                type="button"
                onClick={addAbTemplate}
                className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 border-dashed transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {abTemplates.length === 0 ? "Selecionar Script" : "Adicionar Script A/B"}
              </button>
            )}

            {/* Custom message fallback (only when no script rows) */}
            {abTemplates.length === 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  Mensagem direta (suporta spintax e variáveis)
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={4}
                  placeholder={"Olá {nome}! Tudo bem?\n\nUse {[Oi|Olá|E aí]} para variação automática."}
                  className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white font-mono placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/40 transition-all resize-none"
                />
              </div>
            )}
          </div>
        </div>
      </FormSection>

      {/* Section 3: Anti-ban delay */}
      <FormSection
        title="Delay Anti-ban"
        description="Intervalo aleatório entre cada envio. Valores maiores = menor risco de banimento."
      >
        <DelayRangeSlider value={delay} onChange={setDelay} />
      </FormSection>

      {/* Section 4: Daily send limit */}
      <FormSection
        title="Limites de Envio"
        description="Número máximo de disparos por dia. Use 0 para enviar sem limite."
      >
        <div className="flex items-center gap-3">
          <NumInput
            value={maxSendsPerDay}
            onChange={setMaxSendsPerDay}
            min={0}
            className="w-28 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all text-center"
          />
          <span className="text-xs text-slate-500">
            {maxSendsPerDay === 0 ? "sem limite diário" : "disparos por dia"}
          </span>
        </div>
      </FormSection>

      {/* Section 5: Follow-up automático */}
      <FormSection
        title="Follow-up Automático"
        description="Contatos sem resposta entram no funil de follow-up desta campanha."
      >
        <div className="space-y-3">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ativar follow-up para esta campanha
            </p>
            <button
              type="button"
              onClick={() => setEnableRemarketing((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                enableRemarketing ? "bg-violet-600" : "bg-slate-300 dark:bg-white/10"
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enableRemarketing ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {/* Expandable config */}
          <AnimatePresence>
            {enableRemarketing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-600/5 p-4 space-y-5">

                  {/* Scripts */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scripts de follow-up (em ordem)</p>
                    {rmktScripts.length === 0 && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">Nenhum script adicionado — o follow-up não será enviado.</p>
                    )}
                    {rmktScripts.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 w-4 text-right shrink-0">{i + 1}</span>
                        <div className="relative flex-1">
                          <select
                            value={s.templateId}
                            onChange={(e) => setRmktScripts((prev) => prev.map((x, j) => j === i ? { templateId: e.target.value } : x))}
                            className="w-full appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg py-2 pl-3 pr-8 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all"
                          >
                            <option value="">Selecionar script…</option>
                            {templates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setRmktScripts((prev) => prev.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRmktScripts((prev) => [...prev, { templateId: "" }])}
                      className="flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Adicionar script
                    </button>
                  </div>

                  {/* Interval */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Intervalo entre follow-ups</p>
                    <IntervalPicker value={rmktIntervalMinutes} onChange={setRmktIntervalMinutes} />
                  </div>

                  {/* Days */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Dias de envio</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_OPTIONS.map(({ value, label }) => {
                        const active = rmktAllowedDays.split(",").includes(value)
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              const days = rmktAllowedDays.split(",").filter(Boolean)
                              const next = active ? days.filter((d) => d !== value) : [...days, value].sort()
                              if (next.length > 0) setRmktAllowedDays(next.join(","))
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              active
                                ? "bg-violet-600 text-white"
                                : "bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] text-slate-500 hover:border-violet-300 dark:hover:border-violet-500/40"
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Window */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Janela de horário</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400">Início</p>
                        <input
                          type="time"
                          value={rmktWindowStart}
                          onChange={(e) => setRmktWindowStart(e.target.value)}
                          className="w-full bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-400">Fim</p>
                        <input
                          type="time"
                          value={rmktWindowEnd}
                          onChange={(e) => setRmktWindowEnd(e.target.value)}
                          className={`w-full bg-white dark:bg-white/[0.04] border rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition-all [color-scheme:dark] ${
                            windowInvalid
                              ? "border-amber-400 dark:border-amber-500/60 focus:border-amber-400"
                              : "border-slate-200 dark:border-white/[0.06] focus:border-violet-500/40"
                          }`}
                        />
                      </div>
                      {windowInvalid && (
                        <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          O horário de início deve ser anterior ao horário de fim.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Max per day */}
                  <div className="flex items-center gap-3">
                    <NumInput
                      value={rmktMaxPerDay}
                      onChange={setRmktMaxPerDay}
                      min={0}
                      className="w-24 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all text-center tabular-nums"
                    />
                    <span className="text-xs text-slate-500">
                      {rmktMaxPerDay === 0 ? "follow-ups por dia (sem limite)" : "follow-ups por dia"}
                    </span>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </FormSection>

      {/* Section 6: Schedule windows */}
      <FormSection
        title="Janelas de Envio"
        description="Restrinja os disparos a horários e dias específicos. Sem regras, o worker dispara 24h."
      >
        <ScheduleRuleBuilder value={rules} onChange={setRules} />
      </FormSection>

      {/* Section 7: Programação (Enviar Agora vs Agendar) */}
      <FormSection
        title="Programação"
        description="Inicie imediatamente ou defina uma data e hora de início automático."
      >
        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] p-1 gap-1">
            <button
              type="button"
              onClick={() => setDispatchMode("now")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                dispatchMode === "now"
                  ? "bg-violet-600 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Enviar Agora
            </button>
            <button
              type="button"
              onClick={() => setDispatchMode("scheduled")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                dispatchMode === "scheduled"
                  ? "bg-amber-500 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Agendar Envio
            </button>
          </div>

          {/* Date + time pickers (only when scheduled) */}
          <AnimatePresence>
            {dispatchMode === "scheduled" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="grid grid-cols-2 gap-3"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CalendarClock className="w-3 h-3" />
                    Data
                  </label>
                  <input
                    type="date"
                    value={schedDate}
                    min={todayStr}
                    onChange={(e) => setSchedDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500/40 transition-all [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    Hora
                  </label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500/40 transition-all [color-scheme:dark]"
                  />
                </div>
                {schedIsPast && (
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-rose-500 dark:text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    A data/hora deve ser no futuro.
                  </div>
                )}
                {scheduledAt && !schedIsPast && (
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                    A campanha será iniciada automaticamente em{" "}
                    {scheduledAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </FormSection>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-400"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <div className="flex gap-3 pb-8">
        {/* Rascunho / Salvar — shown when not scheduling */}
        {(contactMode === "list" || isEdit) && (
          <button
            onClick={() => submit("draft")}
            disabled={!!submitting || !weightValid || hasEmptyScript}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-white/[0.06] text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors disabled:opacity-50"
          >
            {submitting === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Salvar Rascunho" : "Salvar como Rascunho"}
          </button>
        )}

        {dispatchMode === "now" ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => submit("start")}
            disabled={!!submitting || !weightValid || hasEmptyScript}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-violet-900/30"
          >
            {submitting === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isEdit ? "Salvar e Iniciar" : "Criar e Iniciar Agora"}
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => submit("schedule")}
            disabled={!!submitting || schedIsPast || !scheduledAt || !weightValid || hasEmptyScript}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-amber-900/20"
          >
            {submitting === "schedule" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            {isEdit ? "Salvar e Agendar" : "Agendar"}
          </motion.button>
        )}
      </div>

    </div>
  )
}
