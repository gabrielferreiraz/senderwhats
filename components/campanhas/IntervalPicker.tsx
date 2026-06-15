"use client"

import { useState, useCallback, useRef } from "react"
import { ChevronDown } from "lucide-react"

type Unit = "minutes" | "hours" | "days" | "weeks"

const FACTORS: Record<Unit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
  weeks: 10080,
}

const MIN_DISPLAY: Record<Unit, number> = {
  minutes: 1,
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
  const displayValue = Math.max(1, Math.round(value / FACTORS[unit]))
  const [raw, setRaw] = useState(String(displayValue))
  const lastDisplay = useRef(displayValue)

  // Sync raw when displayValue changes externally (parent reset or unit switch)
  if (displayValue !== lastDisplay.current) {
    lastDisplay.current = displayValue
    setRaw(String(displayValue))
  }

  const handleValueChange = useCallback((str: string) => {
    setRaw(str)
    const n = parseInt(str, 10)
    if (isNaN(n) || n < MIN_DISPLAY[unit]) return
    onChange(n * FACTORS[unit])
  }, [unit, onChange])

  const handleUnitChange = useCallback((newUnit: Unit) => {
    const rounded = Math.max(1, Math.round(value / FACTORS[newUnit]))
    lastDisplay.current = rounded // prevent spurious sync on re-render
    setUnit(newUnit)
    setRaw(String(rounded))
    onChange(rounded * FACTORS[newUnit])
  }, [value, onChange])

  const summaryLabel = (() => {
    const n = displayValue
    switch (unit) {
      case "weeks":  return n === 1 ? "1 semana"  : `${n} semanas`
      case "days":   return n === 1 ? "1 dia"     : `${n} dias`
      case "hours":  return n === 1 ? "1 hora"    : `${n} horas`
      default:       return n === 1 ? "1 minuto"  : `${n} minutos`
    }
  })()

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-stretch rounded-xl border border-slate-200 dark:border-white/[0.06] overflow-hidden bg-slate-50 dark:bg-white/[0.04] focus-within:border-violet-500/40 transition-colors">
        {/* Number */}
        <input
          type="number"
          min={MIN_DISPLAY[unit]}
          value={raw}
          onChange={(e) => handleValueChange(e.target.value)}
          onBlur={() => {
            const n = parseInt(raw, 10)
            const safe = isNaN(n) ? MIN_DISPLAY[unit] : Math.max(MIN_DISPLAY[unit], n)
            lastDisplay.current = safe
            setRaw(String(safe))
            onChange(safe * FACTORS[unit])
          }}
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
