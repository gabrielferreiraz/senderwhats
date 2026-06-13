import type { LucideIcon } from "lucide-react"

type Trend = {
  value: number
  label: string
}

type StatsCardProps = {
  label: string
  value: string | number
  Icon: LucideIcon
  iconColor: "violet" | "emerald" | "indigo" | "rose"
  trend?: Trend
  sub?: string
}

const iconColors = {
  violet: "text-violet-500 dark:text-violet-400",
  emerald: "text-emerald-500 dark:text-emerald-400",
  indigo: "text-indigo-500 dark:text-indigo-400",
  rose: "text-rose-500 dark:text-rose-400",
}

const accentColors = {
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  indigo: "bg-indigo-500",
  rose: "bg-rose-500",
}

export function StatsCard({ label, value, Icon, iconColor, trend, sub }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-1 h-4 rounded-full ${accentColors[iconColor]}`} />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <Icon className={`w-4 h-4 ${iconColors[iconColor]}`} />
      </div>

      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums">{value}</p>
        {sub && (
          <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-1">{sub}</p>
        )}
      </div>

      {trend && (
        <span
          className={`self-start text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            trend.value >= 0
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
          }`}
        >
          {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
        </span>
      )}
    </div>
  )
}
