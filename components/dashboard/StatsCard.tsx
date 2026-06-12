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

const iconStyles = {
  violet: "bg-violet-100 dark:bg-violet-600/15 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-100 dark:bg-emerald-600/15 text-emerald-600 dark:text-emerald-400",
  indigo: "bg-indigo-100 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-400",
  rose: "bg-rose-100 dark:bg-rose-600/15 text-rose-600 dark:text-rose-400",
}

export function StatsCard({ label, value, Icon, iconColor, trend, sub }: StatsCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none backdrop-blur-sm p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconStyles[iconColor]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend.value >= 0
                ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
            }`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value}% {trend.label}
          </span>
        )}
      </div>

      <div>
        <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
