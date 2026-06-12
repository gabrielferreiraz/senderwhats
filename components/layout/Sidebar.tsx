"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { navItems } from "@/lib/nav"
import { MessageSquare, Wifi } from "lucide-react"
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
    <aside className="w-64 h-full flex flex-col shrink-0 bg-white/90 dark:bg-slate-900/50 backdrop-blur-md border-r border-slate-200 dark:border-white/5">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200 dark:border-white/5">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/40"
        >
          <MessageSquare className="w-4 h-4 text-white" />
        </motion.div>
        <div>
          <p className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">SenderWhats</p>
          <p className="text-[10px] text-slate-500 font-medium">Disparo Profissional</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600 px-3 mb-3">
          Navegação
        </p>
        {navItems.map(({ href, label, Icon }) => {
          const isActive = pathname === href
          return (
            <Link key={href} href={href} className="block">
              <motion.div
                whileHover={{ x: isActive ? 0 : 3 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? "bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-300"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                }`}
              >
                {/* Active border indicator */}
                <AnimatePresence>
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-violet-500 rounded-r-full"
                      initial={{ opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={{ opacity: 0, scaleY: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </AnimatePresence>

                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
                    isActive ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <span className="truncate">{label}</span>
              </motion.div>
            </Link>
          )
        })}
      </nav>

      {/* Instance Widget */}
      <div className="px-3 pb-4">
        <motion.div
          initial={false}
          className="rounded-xl p-3.5 border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03]"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Instâncias</span>
            </div>
            {mounted && instances.online > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
          </div>

          <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">
            {mounted ? instances.online : "—"}
            <span className="text-slate-400 dark:text-slate-500 font-normal"> / {mounted ? instances.total : "—"} ativas</span>
          </p>

          {/* Progress bar */}
          <div className="h-1 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                onlineRatio === 1
                  ? "bg-emerald-500"
                  : onlineRatio > 0
                  ? "bg-amber-500"
                  : "bg-slate-300 dark:bg-slate-700"
              }`}
              initial={{ width: 0 }}
              animate={{ width: mounted ? `${onlineRatio * 100}%` : "0%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </motion.div>
      </div>
    </aside>
  )
}
