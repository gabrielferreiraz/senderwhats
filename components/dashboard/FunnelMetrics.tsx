type FunnelData = {
  enviadas: number
  falhas: number
  pendentes: number
  taxaSucesso: number
}

const rows = [
  { key: "enviadas" as const, label: "Enviadas",  color: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
  { key: "pendentes" as const, label: "Pendentes", color: "bg-amber-400",  text: "text-amber-600 dark:text-amber-400" },
  { key: "falhas" as const,    label: "Falhas",    color: "bg-rose-500",   text: "text-rose-600 dark:text-rose-400" },
]

export function FunnelMetrics({ data }: { data: FunnelData }) {
  const total = data.enviadas + data.falhas + data.pendentes

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Funil de Mensagens</p>
      </div>

      <div className="space-y-3.5">
        {rows.map(({ key, label, color, text }) => {
          const value = data[key]
          const pct = total > 0 ? Math.round((value / total) * 100) : 0
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold tabular-nums ${text}`}>{pct}%</span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-600 tabular-nums w-16 text-right">
                    {value.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
              <div className="h-1 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} rounded-full transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-white/[0.05]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Taxa de sucesso</span>
          <span className={`text-sm font-bold tabular-nums ${
            data.taxaSucesso >= 80 ? "text-emerald-600 dark:text-emerald-400"
            : data.taxaSucesso >= 50 ? "text-amber-600 dark:text-amber-400"
            : "text-rose-600 dark:text-rose-400"
          }`}>
            {data.taxaSucesso}%
          </span>
        </div>
        <div className="mt-2 h-1 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
            style={{ width: `${data.taxaSucesso}%` }}
          />
        </div>
      </div>
    </div>
  )
}
