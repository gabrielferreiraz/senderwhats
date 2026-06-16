"use client"

import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { navItems } from "@/lib/nav"
import { Sun, Moon, Menu, ChevronRight } from "lucide-react"

type Props = { onMenuClick: () => void }

const SUB_LABELS: Record<string, string> = {
  "/nova":    "Nova",
  "/novo":    "Novo",
  "/editar":  "Editar",
}

function useBreadcrumb(): { section: string; sub?: string } {
  const pathname = usePathname()
  const item = navItems.find((i) =>
    i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)
  )
  if (!item) return { section: "SenderWhats" }

  const rest = pathname.slice(item.href === "/" ? 0 : item.href.length)
  if (!rest || rest === "/") return { section: item.label }

  // Check known sub-routes first
  for (const [suffix, label] of Object.entries(SUB_LABELS)) {
    if (rest === suffix || rest.endsWith(suffix)) return { section: item.label, sub: label }
  }

  // Has ID segment(s) → detail page
  if (/^\/[^/]+(\/.*)?$/.test(rest)) return { section: item.label, sub: "Detalhe" }

  return { section: item.label }
}

export function Topbar({ onMenuClick }: Props) {
  const { section, sub } = useBreadcrumb()

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-[#0b0f19] border-b border-slate-200 dark:border-white/[0.06]">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className={`text-sm font-semibold truncate ${sub ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}>
            {section}
          </h1>
          {sub && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{sub}</span>
            </>
          )}
        </div>
      </div>

      <ThemeToggle />
    </header>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-7 h-7" />

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  )
}
