"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { navItems } from "@/lib/nav"
import { Database, Cpu, Sun, Moon } from "lucide-react"

export function Topbar() {
  const pathname = usePathname()
  const current = navItems.find((item) => item.href === pathname)
  const title = current?.label ?? "SenderWhats"

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/30 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
      {/* Page title */}
      <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-5">
        <StatusDot color="emerald" label="Banco" icon={<Database className="w-3 h-3" />} />
        <StatusDot color="amber" label="Worker" icon={<Cpu className="w-3 h-3" />} />
        <ThemeToggle />
      </div>
    </header>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-8 h-8" />

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}

function StatusDot({
  color,
  label,
  icon,
}: {
  color: "emerald" | "amber" | "red"
  label: string
  icon: React.ReactNode
}) {
  const dotColors = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
      {icon}
      <span>{label}</span>
    </div>
  )
}
