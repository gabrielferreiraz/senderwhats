"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Megaphone, FileEdit } from "lucide-react"

export function CampanhasNav({ draftCount }: { draftCount: number }) {
  const pathname = usePathname()

  const tabs = [
    { href: "/campanhas",           label: "Campanhas",  Icon: Megaphone },
    { href: "/campanhas/rascunhos", label: "Rascunhos",  Icon: FileEdit,  count: draftCount },
  ]

  return (
    <div className="flex items-center gap-0.5 mb-6 border-b border-slate-200 dark:border-white/[0.06]">
      {tabs.map(({ href, label, Icon, count }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? "border-violet-500 text-violet-600 dark:text-violet-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-white/[0.12]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count !== undefined && count > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                active
                  ? "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400"
                  : "bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400"
              }`}>
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
