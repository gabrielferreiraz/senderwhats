"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { navItems } from "@/lib/nav"
import { Database, Cpu, Sun, Moon, Menu } from "lucide-react"

type Props = { onMenuClick: () => void }

export function Topbar({ onMenuClick }: Props) {
  const pathname = usePathname()
  // Match exact for "/" and prefix for others
  const current = navItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )
  const title = current?.label ?? "SenderWhats"

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 sm:px-6 bg-white/80 dark:bg-slate-900/30 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
          {title}
        </h1>
      </div>

      {/* Right: status dots (desktop only) + theme toggle */}
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-5">
          <StatusDot color="emerald" label="Banco" icon={<Database className="w-3 h-3" />} />
          <StatusDot color="amber" label="Worker" icon={<Cpu className="w-3 h-3" />} />
        </div>
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
