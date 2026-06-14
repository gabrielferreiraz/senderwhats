"use client"

import { useState, useCallback } from "react"
import { ChevronDown } from "lucide-react"

type Unit = "minutes" | "hours" | "days" | "weeks"

const FACTORS: Record<Unit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
}

const LABELS: Record<Unit, string> = {
  minutes: "Minutos",
  hours: "Horas",
  days: "Dias",
  weeks: "Semanas",
}

const MIN_MINUTES: Record<Unit, number> = {
  minutes: 30,
  hours: 1,
  days: 1,
  weeks: 1,
}

function detectUnit(minutes: number): Unit {
  if (minutes >= 10080 && minutes % 10080 === 0) return "weeks"
  if (minutes >= 1440 && minutes % 1440 === 0) return "days"
  if (minutes >= 60 && minutes % 60 === 0) return "hours"
  return "minutes"
}

type Props = {
  value: number         // always in minutes
  onChange: (minutes: number) => void
  className?: string
}

export function IntervalPicker({ value, onChange, className = "" }: Props) {
  const [unit, setUnit] = useState<Unit>(() => detectUnit(value))
  const displayValue = Math.round(value / FACTORS[unit]) || 1

  const handleValueChange = useCallback((raw: string) => {
    const n = parseInt(raw, 10)
    if (isNaN(n) || n < 1) return
    onChange(n * FACTORS[unit])
  }, [unit, onChange])

  const handleUnitChange = useCallback((newUnit: Unit) => {
    // Keep the underlying minutes value — just change how it's displayed.
    // e.g. "24 horas" → switch to "dias" → shows "1 dia" (1440 min unchanged)
    setUnit(newUnit)
  }, [])

  const summaryLabel = (() => {
    const mins = value
    if (mins >= 10080) {
      const weeks = mins / 10080
      return weeks === 1 ? "1 semana" : `${weeks} semanas`
    }
    if (mins >= 1440) {
      const days = mins / 1440
      return days === 1 ? "1 dia" : `${days} dias`
    }
    if (mins >= 60) {
      const hours = mins / 60
      return hours === 1 ? "1 hora" : `${hours} horas`
    }
    return mins === 1 ? "1 minuto" : `${mins} minutos`
  })()

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-stretch rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden bg-slate-50 dark:bg-white/[0.04] focus-within:border-violet-500/40 transition-colors">
        {/* Number */}
        <input
          type="number"
          min={MIN_MINUTES[unit]}
          value={displayValue}
          onChange={(e) => handleValueChange(e.target.value)}
          className="w-20 min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none text-center tabular-nums"
        />

        {/* Divider */}
        <div className="w-px bg-slate-200 dark:bg-white/[0.06] self-stretch flex-shrink-0" />

        {/* Unit select */}
        <div className="relative flex-1 flex items-center">
          <select
            value={unit}
            onChange={(e) => handleUnitChange(e.target.value as Unit)}
            className="w-full h-full bg-transparent pl-3 pr-8 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none cursor-pointer"
          >
            <option value="minutes">Minutos</option>
            <option value="hours">Horas</option>
            <option value="days">Dias</option>
            <option value="weeks">Semanas</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none flex-shrink-0" />
        </div>
      </div>

      {/* Human-readable summary */}
      <p className="text-[11px] text-slate-400 pl-1">
        A cada <span className="text-slate-500 dark:text-slate-300 font-medium">{summaryLabel}</span> sem resposta
      </p>
    </div>
  )
}
