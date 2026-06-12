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
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          />

          {/* Drawer panel */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col lg:hidden bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-white/5 shadow-2xl"
          >
            {/* Logo + close */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">SenderWhats</p>
                  <p className="text-[10px] text-slate-500 font-medium">Disparo Profissional</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map(({ href, label, Icon }) => {
                const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href)
                return (
                  <Link key={href} href={href} onClick={onClose}>
                    <div
                      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-300"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? "text-violet-600 dark:text-violet-400" : "text-slate-400 dark:text-slate-500"
                        }`}
                      />
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
