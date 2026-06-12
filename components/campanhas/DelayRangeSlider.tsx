"use client"

type Props = {
  min?: number
  max?: number
  step?: number
  value: [number, number]
  onChange: (value: [number, number]) => void
}

function fmtSec(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m}min` : `${m}min ${r}s`
}

export function DelayRangeSlider({
  min = 1,
  max = 5000,
  step = 1,
  value,
  onChange,
}: Props) {
  const [lo, hi] = value

  const loPercent = ((lo - min) / (max - min)) * 100
  const hiPercent = ((hi - min) / (max - min)) * 100

  const handleLo = (v: number) => {
    const clamped = Math.min(v, hi - step)
    onChange([Math.max(min, clamped), hi])
  }

  const handleHi = (v: number) => {
    const clamped = Math.max(v, lo + step)
    onChange([lo, Math.min(max, clamped)])
  }

  return (
    <div className="space-y-4">
      {/* Labels */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400">Delay entre envios</span>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="text-violet-600 dark:text-violet-400">{fmtSec(lo)}</span>
          <span className="text-slate-400 text-xs">→</span>
          <span className="text-violet-500 dark:text-violet-300">{fmtSec(hi)}</span>
        </div>
      </div>

      {/* Slider track */}
      <div className="relative h-8 flex items-center select-none">
        {/* Background track */}
        <div className="absolute w-full h-2 rounded-full bg-slate-200 dark:bg-white/[0.08]" />

        {/* Active range fill */}
        <div
          className="absolute h-2 rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
          style={{ left: `${loPercent}%`, right: `${100 - hiPercent}%` }}
        />

        {/*
          Dois inputs sobrepostos. pointer-events:none no elemento inteiro +
          pointer-events:auto no thumb via pseudo-elemento — resolve o conflito
          de z-index que impedia o thumb de mínimo de ser arrastado.
        */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => handleLo(parseInt(e.target.value))}
          className="absolute w-full h-8 opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => handleHi(parseInt(e.target.value))}
          className="absolute w-full h-8 opacity-0 cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
        />

        {/* Lo thumb visual */}
        <div
          className="absolute -translate-x-1/2 pointer-events-none w-5 h-5 rounded-full bg-white border-2 border-violet-500 shadow-lg shadow-violet-900/40"
          style={{ left: `${loPercent}%` }}
        />

        {/* Hi thumb visual */}
        <div
          className="absolute -translate-x-1/2 pointer-events-none w-5 h-5 rounded-full bg-white border-2 border-violet-400 shadow-lg shadow-violet-900/40"
          style={{ left: `${hiPercent}%` }}
        />
      </div>

      {/* Min / Max labels */}
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{fmtSec(min)}</span>
        <span className="text-[9px] text-slate-400 dark:text-slate-700">anti-ban: delays aleatórios neste intervalo</span>
        <span>{fmtSec(max)}</span>
      </div>
    </div>
  )
}
