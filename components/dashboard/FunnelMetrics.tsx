type FunnelData = {
  enviadas: number
  falhas: number
  pendentes: number
  taxaSucesso: number
}

function FunnelStep({
  label,
  value,
  pct,
  color,
  width,
}: {
  label: string
  value: number
  pct: number
  color: string
  width: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`${width} h-10 rounded-xl flex items-center justify-center ${color} transition-all duration-500`}
      >
        <span className="text-sm font-bold text-white">{value.toLocaleString("pt-BR")}</span>
      </div>
      <p className="text-[10px] text-slate-500 font-medium text-center">{label}</p>
      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-600">{pct}%</span>
    </div>
  )
}

export function FunnelMetrics({ data }: { data: FunnelData }) {
  const total = data.enviadas + data.falhas + data.pendentes
  const pctEnviadas = total > 0 ? Math.round((data.enviadas / total) * 100) : 0
  const pctFalhas = total > 0 ? Math.round((data.falhas / total) * 100) : 0
  const pctPendentes = total > 0 ? Math.round((data.pendentes / total) * 100) : 0

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none backdrop-blur-sm p-5">
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Funil de Mensagens</p>
        <p className="text-xs text-slate-500 mt-0.5">Distribuição de status total</p>
      </div>

      <div className="flex items-end justify-around gap-2 mb-4">
        <FunnelStep
          label="Enviadas"
          value={data.enviadas}
          pct={pctEnviadas}
          color="bg-violet-600/70"
          width="w-full"
        />
        <FunnelStep
          label="Pendentes"
          value={data.pendentes}
          pct={pctPendentes}
          color="bg-amber-500/70"
          width="w-full"
        />
        <FunnelStep
          label="Falhas"
          value={data.falhas}
          pct={pctFalhas}
          color="bg-rose-500/70"
          width="w-full"
        />
      </div>

      {/* Success rate bar */}
      <div className="border-t border-slate-200 dark:border-white/5 pt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">Taxa de Sucesso</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{data.taxaSucesso}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${data.taxaSucesso}%` }}
          />
        </div>
      </div>
    </div>
  )
}
