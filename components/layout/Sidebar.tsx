"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { navItems } from "@/lib/nav"
import { MessageSquare } from "lucide-react"
import { useEffect, useState } from "react"

type InstanceSummary = { online: number; total: number }

export function Sidebar() {
  const pathname = usePathname()
  const [instances, setInstances] = useState<InstanceSummary>({ online: 0, total: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const fetchSummary = async () => {
      try {
        const res = await fetch("/api/instances/summary", { cache: "no-store" })
        if (res.ok) setInstances(await res.json())
      } catch {}
    }
    fetchSummary()
    const id = setInterval(fetchSummary, 10_000)
    return () => clearInterval(id)
  }, [])

  const onlineRatio = instances.total > 0 ? instances.online / instances.total : 0

  return (
    <aside className="hidden lg:flex w-56 h-full flex-col shrink-0 bg-white dark:bg-[#0b0f19] border-r border-slate-200 dark:border-white/[0.06]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-semibold text-sm text-slate-900 dark:text-white tracking-tight">SenderWhats</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className="block">
              <div
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-100 cursor-pointer ${
                  isActive
                    ? "bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white font-medium"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.04] font-normal"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-violet-600 dark:text-violet-400" : ""}`} />
                <span className="truncate">{label}</span>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-pip"
                    className="absolute right-2.5 w-1.5 h-1.5 rounded-full bg-violet-500"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Instance status — minimal */}
      <div className="px-3 pb-4 shrink-0">
        <div className="flex items-center justify-between px-1 py-2 border-t border-slate-100 dark:border-white/[0.04] mt-1 pt-3">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {mounted
              ? instances.total === 0
                ? "Nenhuma instância"
                : `${instances.online} / ${instances.total} online`
              : "—"}
          </span>
          {mounted && instances.total > 0 && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              {onlineRatio > 0 && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  onlineRatio === 1 ? "bg-emerald-500" : "bg-amber-400"
                }`} />
              )}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                onlineRatio === 0 ? "bg-slate-300 dark:bg-slate-700"
                : onlineRatio === 1 ? "bg-emerald-500"
                : "bg-amber-400"
              }`} />
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}
