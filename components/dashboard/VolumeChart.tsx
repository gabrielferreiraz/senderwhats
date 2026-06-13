"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

type DayData = {
  day: string
  enviadas: number
  falhas: number
}

type CustomTooltipProps = {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-white/[0.06] rounded-lg p-2.5 shadow-lg text-xs">
      <p className="font-medium text-slate-600 dark:text-slate-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 capitalize">{p.name}:</span>
          <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{p.value.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  )
}

export function VolumeChart({ data, subtitle = "Últimos 7 dias" }: { data: DayData[]; subtitle?: string }) {
  const hasData = data.some((d) => d.enviadas > 0 || d.falhas > 0)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Volume de Disparos</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-violet-500" />
            Enviadas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-rose-400" />
            Falhas
          </span>
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={data} barGap={3} barSize={14}>
            <CartesianGrid strokeDasharray="0" stroke="rgba(100,116,139,0.08)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(100,116,139,0.04)" }} />
            <Bar dataKey="enviadas" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="falhas" fill="#fb7185" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[190px] flex items-center justify-center">
          <p className="text-xs text-slate-400 dark:text-slate-600">Nenhuma mensagem enviada ainda.</p>
        </div>
      )}
    </div>
  )
}
