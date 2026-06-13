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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-lg dark:shadow-2xl text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 capitalize">{p.name}:</span>
          <span className="font-bold text-slate-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function VolumeChart({ data, subtitle = "Últimos 7 dias" }: { data: DayData[]; subtitle?: string }) {
  const hasData = data.some((d) => d.enviadas > 0 || d.falhas > 0)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Volume de Disparos</p>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />
            Enviadas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            Falhas
          </span>
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barGap={4} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.12)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(100,116,139,0.06)" }} />
            <Bar dataKey="enviadas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="falhas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-sm text-slate-400 dark:text-slate-600">Nenhuma mensagem enviada ainda.</p>
        </div>
      )}
    </div>
  )
}
