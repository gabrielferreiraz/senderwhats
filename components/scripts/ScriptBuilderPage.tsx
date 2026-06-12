"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  ChevronDown,
  CheckCircle2,
  Database,
  Search,
  X,
  Shuffle,
  Maximize2,
  Minimize2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
} from "lucide-react"
import { PhoneMockup } from "./PhoneMockup"

// ─── Types ────────────────────────────────────────────────────────────────────

type StepState = {
  id: string
  body: string
  delayAfterSeconds: number
}

type TemplateInput = {
  id: string
  name: string
  steps: { stepOrder: number; body: string; delayAfter: number }[]
}

type ListVars = {
  listId: string
  listName: string
  variables: string[]
}

type Props = {
  template?: TemplateInput
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

const QUICK_TAGS = [
  { label: "{nome}", value: "{nome}" },
  { label: "{nome_completo}", value: "{nome_completo}" },
  { label: "{telefone}", value: "{telefone}" },
]

// ─── DelayPicker ─────────────────────────────────────────────────────────────

function DelayPicker({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  const [unit, setUnit] = useState<"s" | "m" | "h">(() => {
    if (value >= 3600 && value % 3600 === 0) return "h"
    if (value >= 60 && value % 60 === 0) return "m"
    return "s"
  })
  const maxByUnit = { s: 300, m: 60, h: 168 } as const
  const displayValue = unit === "h" ? value / 3600 : unit === "m" ? value / 60 : value

  const handleAmountChange = (v: number) => {
    const clamped = Math.max(1, Math.min(maxByUnit[unit], v))
    onChange(unit === "h" ? clamped * 3600 : unit === "m" ? clamped * 60 : clamped)
  }

  const handleUnitChange = (u: "s" | "m" | "h") => {
    setUnit(u)
    if (u === "h") onChange(Math.max(1, Math.min(168, Math.round(value / 3600))) * 3600)
    else if (u === "m") onChange(Math.max(1, Math.min(60, Math.round(value / 60))) * 60)
    else onChange(Math.max(1, Math.min(300, value)))
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className="shrink-0">Aguardar</span>
      <input
        type="number"
        min={1}
        max={maxByUnit[unit]}
        value={displayValue}
        onChange={(e) => handleAmountChange(parseInt(e.target.value) || 1)}
        className="w-14 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-1 text-center text-slate-900 dark:text-white text-xs focus:outline-none focus:border-violet-500/40 transition-all"
      />
      <div className="relative">
        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as "s" | "m" | "h")}
          className="appearance-none bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg pl-2.5 pr-6 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer"
        >
          <option value="s" className="bg-slate-900">segundos</option>
          <option value="m" className="bg-slate-900">minutos</option>
          <option value="h" className="bg-slate-900">horas</option>
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
      <span className="shrink-0">antes do próximo passo</span>
    </div>
  )
}

// ─── VarPicker popover ────────────────────────────────────────────────────────

function VarPicker({
  stepId,
  listVars,
  onInsert,
  onClose,
}: {
  stepId: string
  listVars: ListVars[]
  onInsert: (stepId: string, key: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const filtered = listVars
    .map((l) => ({
      ...l,
      variables: l.variables.filter((v) =>
        v.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((l) => l.variables.length > 0)

  const hasResults = filtered.length > 0
  const totalVars = listVars.reduce((a, l) => a + l.variables.length, 0)

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden"
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-white/5">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar variável..."
          className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* List */}
      <div className="max-h-64 overflow-y-auto">
        {totalVars === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <Database className="w-6 h-6 text-slate-300 dark:text-slate-700" />
            <p className="text-xs text-slate-500 dark:text-slate-600">
              Nenhuma variável encontrada.
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-700">
              Importe uma planilha com colunas extras para vê-las aqui.
            </p>
          </div>
        ) : !hasResults ? (
          <div className="py-6 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-600">
              Nenhuma variável corresponde a &ldquo;{search}&rdquo;
            </p>
          </div>
        ) : (
          filtered.map((list) => (
            <div key={list.listId}>
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                <Database className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider truncate">
                  {list.listName}
                </span>
              </div>
              <div className="px-2 pb-2 flex flex-wrap gap-1">
                {list.variables.map((v) => (
                  <button
                    key={v}
                    onMouseDown={(e) => {
                      e.preventDefault() // keep textarea focus
                      onInsert(stepId, v)
                    }}
                    className="text-[10px] font-mono font-medium px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20 transition-colors"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {totalVars > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 dark:border-white/5">
          <p className="text-[10px] text-slate-400 dark:text-slate-600">
            {totalVars} variável{totalVars !== 1 ? "s" : ""} em {listVars.length} lista{listVars.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </motion.div>
  )
}

// ─── Spintax helpers ─────────────────────────────────────────────────────────

type SpintaxMatch = { start: number; end: number; options: string[] }

function findSpintaxAtCursor(text: string, cursor: number): SpintaxMatch | null {
  const regex = /\{\[([^\]]+)\]\}/g
  let m
  while ((m = regex.exec(text)) !== null) {
    if (cursor >= m.index && cursor <= m.index + m[0].length) {
      return {
        start: m.index,
        end: m.index + m[0].length,
        options: m[1].split("|").map((s) => s.trim()).filter(Boolean),
      }
    }
  }
  return null
}

// ─── SpintaxPicker popover ───────────────────────────────────────────────────

function SpintaxPicker({
  stepId,
  onInsert,
  onClose,
  initialOptions,
  replaceRange,
}: {
  stepId: string
  onInsert: (stepId: string, text: string, replaceRange?: { start: number; end: number }) => void
  onClose: () => void
  initialOptions?: string[]
  replaceRange?: { start: number; end: number }
}) {
  const isEditing = !!initialOptions
  const [options, setOptions] = useState(initialOptions ?? ["", ""])
  const [previewIdx, setPreviewIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const validOptions = options.map(o => o.trim()).filter(Boolean)
  const canInsert = validOptions.length >= 2

  const handleInsert = () => {
    if (!canInsert) return
    onInsert(stepId, `{[${validOptions.join("|")}]}`, replaceRange)
    onClose()
  }

  const cyclePreview = () => setPreviewIdx(i => (i + 1) % Math.max(1, validOptions.length))

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute left-0 top-full mt-1.5 z-50 w-80 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Shuffle className="w-3.5 h-3.5 text-violet-500" />
          <p className="text-xs font-semibold text-slate-900 dark:text-white">
            {isEditing ? "Editar Variação" : "Variação de Texto"}
          </p>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
          {isEditing
            ? "Altere as opções abaixo e confirme para atualizar."
            : "Uma das opções abaixo será escolhida aleatoriamente para cada contato."}
        </p>
      </div>

      {/* Options */}
      <div className="p-3 space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-[10px] font-bold text-slate-400 w-4 text-center shrink-0 mt-2">{i + 1}</span>
            <textarea
              ref={i === 0 ? firstRef : undefined}
              value={opt}
              rows={1}
              onChange={(e) => {
                const next = [...options]
                next[i] = e.target.value
                setOptions(next)
                e.target.style.height = "auto"
                e.target.style.height = e.target.scrollHeight + "px"
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleInsert() } }}
              placeholder={`Opção ${i + 1}...`}
              className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/40 transition-all resize-none leading-relaxed overflow-hidden"
            />
            {options.length > 2 && (
              <button
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                className="text-slate-300 dark:text-slate-700 hover:text-rose-500 transition-colors shrink-0 mt-2"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {options.length < 6 && (
          <button
            onClick={() => setOptions([...options, ""])}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors ml-6"
          >
            <Plus className="w-3 h-3" />
            Adicionar outra opção
          </button>
        )}
      </div>

      {/* Live preview */}
      {canInsert && (
        <div className="px-3 pb-2">
          <button
            onClick={cyclePreview}
            className="w-full flex items-start justify-between gap-2 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 px-3 py-2.5 group text-left"
          >
            <span className="text-[10px] text-violet-500 dark:text-violet-400 font-medium shrink-0 mt-px">Exemplo:</span>
            <span className="text-[10px] text-violet-700 dark:text-violet-300 font-semibold flex-1 leading-relaxed break-words min-w-0">
              &ldquo;{validOptions[previewIdx % validOptions.length]}&rdquo;
            </span>
            <Shuffle className="w-3 h-3 text-violet-400 shrink-0 group-hover:rotate-180 transition-transform duration-300 mt-px" />
          </button>
        </div>
      )}

      {/* Insert button */}
      <div className="px-3 pb-3">
        <button
          onMouseDown={(e) => { e.preventDefault(); handleInsert() }}
          disabled={!canInsert}
          className="w-full py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
        >
          {isEditing ? "Salvar alterações" : "Inserir variação no texto"}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScriptBuilderPage({ template }: Props) {
  const router = useRouter()

  const [name, setName] = useState(template?.name ?? "")
  const [steps, setSteps] = useState<StepState[]>(() =>
    template?.steps.length
      ? template.steps.map((s) => ({
          id: uid(),
          body: s.body,
          delayAfterSeconds: s.delayAfter,
        }))
      : [{ id: uid(), body: "", delayAfterSeconds: 30 }]
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [listVars, setListVars] = useState<ListVars[]>([])
  const [varPickerStepId, setVarPickerStepId] = useState<string | null>(null)
  const [spintaxPickerStepId, setSpintaxPickerStepId] = useState<string | null>(null)
  const [editingSpintax, setEditingSpintax] = useState<{ stepId: string } & SpintaxMatch | null>(null)
  const [cursorSpintax, setCursorSpintax] = useState<Record<string, SpintaxMatch | null>>({})
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  useEffect(() => {
    fetch("/api/variables")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ListVars[]) => setListVars(data))
      .catch(() => {})
  }, [])

  const updateStep = useCallback((id: string, patch: Partial<StepState>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    setSavedAt(null)
  }, [])

  const addStep = () => {
    const newStep: StepState = { id: uid(), body: "", delayAfterSeconds: 30 }
    setSteps((prev) => [...prev, newStep])
    setSavedAt(null)
    setTimeout(() => {
      textareaRefs.current[newStep.id]?.focus()
    }, 50)
  }

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
    setConfirmRemove(null)
    setSavedAt(null)
  }

  // Uses execCommand so the browser records the change in its native undo/redo stack.
  // Falls back to direct state update if execCommand is unavailable.
  const applyToTextarea = useCallback((
    stepId: string,
    start: number,
    end: number,
    text: string,
    cursorStart: number,
    cursorEnd?: number,
  ) => {
    const el = textareaRefs.current[stepId]
    if (!el) return
    el.focus()
    el.setSelectionRange(start, end)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    if (document.execCommand('insertText', false, text)) {
      setTimeout(() => el.setSelectionRange(cursorStart, cursorEnd ?? cursorStart), 0)
    } else {
      // Fallback for environments without execCommand (breaks undo)
      const step = steps.find((s) => s.id === stepId)
      if (!step) return
      const newBody = step.body.slice(0, start) + text + step.body.slice(end)
      updateStep(stepId, { body: newBody })
      setTimeout(() => {
        el.setSelectionRange(cursorStart, cursorEnd ?? cursorStart)
      }, 0)
    }
  }, [steps, updateStep])

  const insertAtCursor = useCallback((
    stepId: string,
    tag: string,
    replaceRange?: { start: number; end: number }
  ) => {
    const el = textareaRefs.current[stepId]
    if (!el) return
    const start = replaceRange?.start ?? el.selectionStart
    const end = replaceRange?.end ?? el.selectionEnd
    applyToTextarea(stepId, start, end, tag, start + tag.length)
    setCursorSpintax((prev) => ({ ...prev, [stepId]: null }))
  }, [applyToTextarea])

  const formatText = useCallback((stepId: string, marker: string) => {
    const el = textareaRefs.current[stepId]
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = el.value.slice(start, end)
    if (selected) {
      applyToTextarea(stepId, start, end, marker + selected + marker,
        start + marker.length, end + marker.length)
    } else {
      applyToTextarea(stepId, start, end, marker + marker, start + marker.length)
    }
  }, [applyToTextarea])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)

    const payload = {
      name: name.trim(),
      steps: steps.map((s) => ({
        body: s.body,
        delayAfter: s.delayAfterSeconds,
      })),
    }

    try {
      if (template) {
        const res = await fetch(`/api/templates/${template.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (res.ok) setSavedAt(Date.now())
      } else {
        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) return
        const data: { id: string } = await res.json()
        router.push(`/scripts/${data.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const isSaved = savedAt !== null && !saving

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/scripts")}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setSavedAt(null) }}
          placeholder="Nome do script..."
          className="flex-1 bg-transparent text-xl font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none border-b-2 border-transparent focus:border-violet-500/40 pb-1 transition-all"
        />

        <AnimatePresence mode="wait">
          {isSaved ? (
            <motion.div
              key="saved"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium px-4 py-2.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              Salvo
            </motion.div>
          ) : (
            <motion.button
              key="save"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30 whitespace-nowrap"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Salvando..." : "Salvar Script"}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Split pane ──────────────────────────────────────────────────────── */}
      <div className="flex gap-10 items-start">
        {/* LEFT: Builder timeline */}
        <div className="flex-[0_0_58%] min-w-0">
          <AnimatePresence>
            {steps.map((step, index) => {
              const isLast = index === steps.length - 1
              const isFocused = focusedId === step.id
              const isVarOpen = varPickerStepId === step.id
              const isSpintaxOpen = spintaxPickerStepId === step.id

              return (
                <motion.div
                  key={step.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2 }}
                  className="relative flex gap-4"
                >
                  {/* Timeline axis */}
                  <div className="flex flex-col items-center pt-1 shrink-0" style={{ width: 32 }}>
                    <motion.div
                      animate={
                        isFocused
                          ? { boxShadow: "0 0 0 3px rgba(139,92,246,0.25)" }
                          : { boxShadow: "0 0 0 0px transparent" }
                      }
                      className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-[11px] font-bold z-10 shrink-0 transition-shadow"
                    >
                      {index + 1}
                    </motion.div>
                    {!isLast && (
                      <div className="w-px flex-1 my-1.5 border-l-2 border-dashed border-slate-200 dark:border-white/[0.08]" />
                    )}
                  </div>

                  {/* Step card */}
                  <div
                    className={`flex-1 mb-5 rounded-2xl border transition-all duration-200 ${
                      isFocused
                        ? "border-violet-400/40 dark:border-violet-500/25 bg-violet-50 dark:bg-violet-600/[0.04]"
                        : "border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] shadow-sm dark:shadow-none"
                    }`}
                  >
                    <div className="p-4 space-y-3">
                      {/* Quick insert row */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-wider mr-1">
                          Inserir:
                        </span>

                        {/* Fixed quick tags */}
                        {QUICK_TAGS.map((tag) => (
                          <button
                            key={tag.label}
                            onClick={() => insertAtCursor(step.id, tag.value)}
                            className="text-[10px] font-mono font-medium px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.05] hover:bg-violet-100 dark:hover:bg-violet-600/20 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors border border-slate-200 dark:border-white/[0.05] hover:border-violet-400/40 dark:hover:border-violet-500/20"
                          >
                            {tag.label}
                          </button>
                        ))}

                        {/* Separator */}
                        <span className="text-slate-200 dark:text-white/10 select-none">|</span>

                        {/* Spintax picker trigger */}
                        <div className="relative">
                          <button
                            onClick={() => {
                              setSpintaxPickerStepId(isSpintaxOpen ? null : step.id)
                              setVarPickerStepId(null)
                            }}
                            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                              isSpintaxOpen
                                ? "bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30 text-violet-700 dark:text-violet-400"
                                : "bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-400 hover:border-violet-300 dark:hover:border-violet-500/30"
                            }`}
                          >
                            <Shuffle className="w-3 h-3" />
                            Variação
                          </button>
                          <AnimatePresence>
                            {isSpintaxOpen && (
                              <SpintaxPicker
                                stepId={step.id}
                                onInsert={(sid, text) => {
                                  insertAtCursor(sid, text)
                                  setSpintaxPickerStepId(null)
                                }}
                                onClose={() => setSpintaxPickerStepId(null)}
                              />
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Edit spintax — appears when cursor is inside a {[...|...]} block */}
                        <AnimatePresence>
                          {cursorSpintax[step.id] && (
                            <motion.div
                              key="edit-spintax"
                              initial={{ opacity: 0, scale: 0.85 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.85 }}
                              transition={{ duration: 0.12 }}
                              className="relative"
                            >
                              <button
                                onClick={() => {
                                  setEditingSpintax({ stepId: step.id, ...cursorSpintax[step.id]! })
                                  setSpintaxPickerStepId(null)
                                  setVarPickerStepId(null)
                                }}
                                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                              >
                                <Shuffle className="w-3 h-3" />
                                Editar variação
                              </button>
                              <AnimatePresence>
                                {editingSpintax?.stepId === step.id && (
                                  <SpintaxPicker
                                    stepId={step.id}
                                    initialOptions={editingSpintax.options}
                                    replaceRange={{ start: editingSpintax.start, end: editingSpintax.end }}
                                    onInsert={(sid, text, range) => {
                                      insertAtCursor(sid, text, range)
                                      setEditingSpintax(null)
                                    }}
                                    onClose={() => setEditingSpintax(null)}
                                  />
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Variable picker trigger */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setVarPickerStepId(isVarOpen ? null : step.id)
                            }
                            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
                              isVarOpen
                                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                : "bg-slate-100 dark:bg-white/[0.05] border-slate-200 dark:border-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-500/30"
                            }`}
                          >
                            <Database className="w-3 h-3" />
                            Variável da Lista
                            {listVars.length > 0 && (
                              <span className={`ml-0.5 px-1 rounded-full text-[9px] font-bold ${
                                isVarOpen
                                  ? "bg-emerald-200 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                                  : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-500"
                              }`}>
                                {listVars.reduce((a, l) => a + l.variables.length, 0)}
                              </span>
                            )}
                          </button>

                          <AnimatePresence>
                            {isVarOpen && (
                              <VarPicker
                                stepId={step.id}
                                listVars={listVars}
                                onInsert={(sid, key) => {
                                  insertAtCursor(sid, `{${key}}`)
                                  setVarPickerStepId(null)
                                }}
                                onClose={() => setVarPickerStepId(null)}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Formatting toolbar */}
                      <div className="flex items-center gap-0.5 pb-1 border-b border-slate-100 dark:border-white/[0.04]">
                        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider mr-2">
                          Formatar:
                        </span>
                        {[
                          { icon: <Bold className="w-3 h-3" />, marker: "*", label: "Negrito  *texto*" },
                          { icon: <Italic className="w-3 h-3" />, marker: "_", label: "Itálico  _texto_" },
                          { icon: <Strikethrough className="w-3 h-3" />, marker: "~", label: "Tachado  ~texto~" },
                          { icon: <Code className="w-3 h-3" />, marker: "```", label: "Monoespaçado  ```texto```" },
                        ].map(({ icon, marker, label }) => (
                          <button
                            key={marker}
                            type="button"
                            title={label}
                            onMouseDown={(e) => { e.preventDefault(); formatText(step.id, marker) }}
                            className="p-1.5 rounded-md text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                          >
                            {icon}
                          </button>
                        ))}
                        <div className="w-px h-3 bg-slate-200 dark:bg-white/[0.07] mx-1" />
                        <button
                          type="button"
                          title={"Lista  - item1&#10;- item2"}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const el = textareaRefs.current[step.id]
                            if (!el) return
                            const pos = el.selectionStart
                            const before = step.body.slice(0, pos)
                            const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
                            insertAtCursor(step.id, `${prefix}- `, { start: pos, end: pos })
                          }}
                          className="p-1.5 rounded-md text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <List className="w-3 h-3" />
                        </button>
                        <span className="ml-auto text-[9px] text-slate-300 dark:text-slate-700 hidden sm:block">
                          Selecione o texto e clique para formatar
                        </span>
                      </div>

                      {/* Textarea */}
                      {(() => {
                        const isExpanded = !!expandedSteps[step.id]
                        return (
                          <div className="relative group/textarea">
                            <textarea
                              ref={(el) => { textareaRefs.current[step.id] = el }}
                              value={step.body}
                              onChange={(e) => {
                                updateStep(step.id, { body: e.target.value })
                                if (isExpanded) {
                                  e.target.style.height = "auto"
                                  e.target.style.height = e.target.scrollHeight + "px"
                                }
                                setCursorSpintax((prev) => ({
                                  ...prev,
                                  [step.id]: findSpintaxAtCursor(e.target.value, e.target.selectionStart),
                                }))
                              }}
                              onSelect={(e) => {
                                const el = e.currentTarget
                                setCursorSpintax((prev) => ({
                                  ...prev,
                                  [step.id]: findSpintaxAtCursor(el.value, el.selectionStart),
                                }))
                              }}
                              onFocus={() => setFocusedId(step.id)}
                              onBlur={() => setFocusedId(null)}
                              placeholder={`Mensagem do passo ${index + 1}... Use {nome}, {nome_completo} ou clique em Variação para alternar textos`}
                              className={`w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-700 resize-none focus:outline-none leading-relaxed transition-all duration-200 ${
                                isExpanded
                                  ? "min-h-[240px]"
                                  : "max-h-[130px] overflow-y-auto"
                              }`}
                              style={{ minHeight: isExpanded ? undefined : 88 }}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSteps((prev) => ({ ...prev, [step.id]: !isExpanded }))
                              }
                              title={isExpanded ? "Recolher" : "Expandir"}
                              className="absolute bottom-1 right-1 p-1 rounded-md opacity-0 group-hover/textarea:opacity-100 focus:opacity-100 transition-opacity text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                            >
                              {isExpanded
                                ? <Minimize2 className="w-3 h-3" />
                                : <Maximize2 className="w-3 h-3" />
                              }
                            </button>
                          </div>
                        )
                      })()}

                      {/* Footer: delay + delete */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-white/[0.04]">
                        {!isLast ? (
                          <DelayPicker
                            value={step.delayAfterSeconds}
                            onChange={(v) => updateStep(step.id, { delayAfterSeconds: v })}
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-700 italic">
                            Último passo — não há delay após este
                          </span>
                        )}

                        {steps.length > 1 && (
                          <AnimatePresence mode="wait">
                            {confirmRemove === step.id ? (
                              <motion.div
                                key="confirm"
                                initial={{ opacity: 0, x: 8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                className="flex items-center gap-1 ml-2"
                              >
                                <button
                                  onClick={() => setConfirmRemove(null)}
                                  className="text-[10px] px-2 py-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                  Não
                                </button>
                                <button
                                  onClick={() => removeStep(step.id)}
                                  className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                                >
                                  Remover
                                </button>
                              </motion.div>
                            ) : (
                              <motion.button
                                key="trash"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setConfirmRemove(step.id)}
                                className="ml-2 p-1.5 rounded-lg text-slate-400 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </motion.button>
                            )}
                          </AnimatePresence>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Add step CTA */}
          <div className="ml-10">
            <motion.button
              whileHover={{ scale: 1.02, borderColor: "rgba(139,92,246,0.3)" }}
              whileTap={{ scale: 0.97 }}
              onClick={addStep}
              className="flex items-center gap-2.5 w-full justify-center py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-white/[0.08] text-sm text-slate-500 dark:text-slate-600 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-600/[0.04] transition-all"
            >
              <Plus className="w-4 h-4" />
              Adicionar passo
            </motion.button>
          </div>

          <p className="text-center text-[10px] text-slate-400 dark:text-slate-700 mt-3">
            {steps.length} passo{steps.length !== 1 ? "s" : ""} na sequência
          </p>
        </div>

        {/* RIGHT: Phone mockup */}
        <div className="flex-[0_0_42%] sticky top-0 pt-1">
          <div className="mb-4 space-y-0.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Preview ao Vivo
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-700">
              Variáveis e variações são simuladas aleatoriamente no preview
            </p>
          </div>
          <PhoneMockup steps={steps} />
        </div>
      </div>
    </div>
  )
}
