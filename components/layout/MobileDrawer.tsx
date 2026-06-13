"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { navItems } from "@/lib/nav"
import { MessageSquare, X } from "lucide-react"

type Props = { open: boolean; onClose: () => void }

export function MobileDrawer({ open, onClose }: Props) {
  const pathname = usePathname()

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />

          {/* Drawer panel */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-64 flex flex-col lg:hidden bg-white dark:bg-[#0b0f19] border-r border-slate-200 dark:border-white/[0.06]"
          >
            {/* Logo + close */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-semibold text-sm text-slate-900 dark:text-white tracking-tight">SenderWhats</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              {navItems.map(({ href, label, Icon }) => {
                const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
                return (
                  <Link key={href} href={href} onClick={onClose}>
                    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white font-medium"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    }`}>
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-violet-600 dark:text-violet-400" : ""}`} />
                      {label}
                    </div>
                  </Link>
                )
              })}
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
