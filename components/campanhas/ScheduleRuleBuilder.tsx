"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Clock } from "lucide-react"

const DAYS = [
  { label: "D", full: "Domingo", value: 0 },
  { label: "S", full: "Segunda", value: 1 },
  { label: "T", full: "Terça", value: 2 },
  { label: "Q", full: "Quarta", value: 3 },
  { label: "Q", full: "Quinta", value: 4 },
  { label: "S", full: "Sexta", value: 5 },
  { label: "S", full: "Sábado", value: 6 },
]

export type ScheduleRule = {
  id: string
  days: number[]
  startTime: string
  endTime: string
  maxContacts: number | null
  maxContactsPeriod: "hour" | "day" | "week"
}

type Props = {
  value: ScheduleRule[]
  onChange: (rules: ScheduleRule[]) => void
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function DayButton({
  day,
  selected,
  onClick,
}: {
  day: { label: string; full: string; value: number }
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={day.full}
      onClick={onClick}
      className={`w-8 h-8 rounded-full text-[11px] font-bold transition-all ${
        selected
          ? "bg-violet-600 text-white shadow-md shadow-violet-900/40"
          : "bg-slate-100 dark:bg-white/[0.05] text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      {day.label}
    </button>
  )
}

function RuleCard({
  rule,
  onChange,
  onRemove,
}: {
  rule: ScheduleRule
  onChange: (patch: Partial<ScheduleRule>) => void
  onRemove: () => void
}) {
  const toggleDay = (day: number) => {
    const days = rule.days.includes(day)
      ? rule.days.filter((d) => d !== day)
      : [...rule.days, day].sort()
    onChange({ days })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0 }}
      className="rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] shadow-sm dark:shadow-none p-4 space-y-4"
    >
      {/* Day selector */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Dias da semana
        </p>
        <div className="flex items-center gap-1.5">
          {DAYS.map((d) => (
            <DayButton
              key={d.value}
              day={d}
              selected={rule.days.includes(d.value)}
              onClick={() => toggleDay(d.value)}
            />
          ))}
        </div>
        {rule.days.length === 0 && (
          <p className="text-[10px] text-rose-400">Selecione pelo menos um dia.</p>
        )}
      </div>

      {/* Time range + limit */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500">Início</label>
          <input
            type="time"
            value={rule.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500">Fim</label>
          <input
            type="time"
            value={rule.endTime}
            onChange={(e) => onChange({ endTime: e.target.value })}
            className={`w-full bg-slate-50 dark:bg-white/5 border rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:outline-none transition-all [color-scheme:light] dark:[color-scheme:dark] ${
              rule.endTime && rule.startTime && rule.endTime <= rule.startTime
                ? "border-rose-400 dark:border-rose-500/60 focus:border-rose-500/80"
                : "border-slate-300 dark:border-white/10 focus:border-violet-500/40"
            }`}
          />
          {rule.endTime && rule.startTime && rule.endTime <= rule.startTime && (
            <p className="text-[10px] text-rose-400">Fim deve ser posterior ao início.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-slate-500">
            Máx. contatos
            <span className="text-slate-400 dark:text-slate-700 ml-1">(opcional)</span>
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={1}
              placeholder="Sem limite"
              value={rule.maxContacts ?? ""}
              onChange={(e) =>
                onChange({ maxContacts: e.target.value ? parseInt(e.target.value) : null })
              }
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-700 focus:outline-none focus:border-violet-500/40 transition-all"
            />
            <select
              value={rule.maxContactsPeriod}
              onChange={(e) => onChange({ maxContactsPeriod: e.target.value as "hour" | "day" | "week" })}
              disabled={rule.maxContacts === null}
              className="shrink-0 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all disabled:opacity-40"
            >
              <option value="hour">/ hora</option>
              <option value="day">/ dia</option>
              <option value="week">/ semana</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary + Remove */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-600">
          <Clock className="w-3 h-3" />
          {rule.days.length > 0 ? (
            <>
              {rule.days.map((d) => DAYS[d]?.full.slice(0, 3)).join(", ")} · {rule.startTime} às{" "}
              {rule.endTime}
              {rule.maxContacts && ` · máx ${rule.maxContacts}/${rule.maxContactsPeriod === "hour" ? "hora" : rule.maxContactsPeriod === "week" ? "sem." : "dia"}`}
            </>
          ) : (
            "Nenhum dia selecionado"
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-slate-400 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          title="Remover regra"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  )
}

export function ScheduleRuleBuilder({ value, onChange }: Props) {
  const addRule = () => {
    const newRule: ScheduleRule = {
      id: uid(),
      days: [1, 2, 3, 4, 5], // Mon–Fri default
      startTime: "09:00",
      endTime: "18:00",
      maxContacts: null,
      maxContactsPeriod: "day",
    }
    onChange([...value, newRule])
  }

  const updateRule = (id: string, patch: Partial<ScheduleRule>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRule = (id: string) => {
    onChange(value.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400">Janelas de Envio</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-0.5">
            Defina quando o worker pode disparar mensagens.{" "}
            {value.length === 0 && "Sem regras = disparo livre 24h."}
          </p>
        </div>
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-600/10 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-600/20 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Adicionar Regra
        </button>
      </div>

      <AnimatePresence>
        {value.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onChange={(patch) => updateRule(rule.id, patch)}
            onRemove={() => removeRule(rule.id)}
          />
        ))}
      </AnimatePresence>

      {value.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] py-5 flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-700">
          Nenhuma restrição de horário — disparará assim que o worker processar a fila.
        </div>
      )}
    </div>
  )
}

// Helper: flatten local rules to DB format
export function flattenRules(
  rules: ScheduleRule[]
): { dayOfWeek: number; startTime: string; endTime: string; maxContacts: number | null; maxContactsPeriod: string }[] {
  return rules.flatMap((r) =>
    r.days.map((day) => ({
      dayOfWeek: day,
      startTime: r.startTime,
      endTime: r.endTime,
      maxContacts: r.maxContacts,
      maxContactsPeriod: r.maxContactsPeriod,
    }))
  )
}
