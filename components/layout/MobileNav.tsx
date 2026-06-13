"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Smartphone, Megaphone, FileCode, Plus } from "lucide-react"

// Left 2 + FAB + Right 2
const LEFT = [
  { href: "/", Icon: LayoutDashboard, label: "Dashboard" },
  { href: "/campanhas", Icon: Megaphone, label: "Campanhas" },
]

const RIGHT = [
  { href: "/instancias", Icon: Smartphone, label: "Instâncias" },
  { href: "/scripts", Icon: FileCode, label: "Scripts" },
]

function NavItem({
  href,
  Icon,
  label,
  active,
}: {
  href: string
  Icon: React.ElementType
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0"
    >
      <Icon
        className={`w-5 h-5 transition-colors ${
          active
            ? "text-violet-600 dark:text-violet-400"
            : "text-slate-400 dark:text-slate-500"
        }`}
      />
      <span
        className={`text-[9px] font-semibold tracking-wide transition-colors truncate ${
          active
            ? "text-violet-600 dark:text-violet-400"
            : "text-slate-400 dark:text-slate-500"
        }`}
      >
        {label}
      </span>
    </Link>
  )
}

export function MobileNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white dark:bg-[#0b0f19] border-t border-slate-200 dark:border-white/[0.06]">
      <div className="flex items-end pb-safe">
        {/* Left items */}
        {LEFT.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Centre FAB */}
        <div className="flex-1 flex flex-col items-center justify-center pb-2.5 pt-1">
          <Link
            href="/campanhas/nova"
            className="w-13 h-13 -mt-5 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 flex items-center justify-center shadow-lg shadow-violet-900/30 transition-colors ring-4 ring-white dark:ring-[#0b0f19]"
            style={{ width: 52, height: 52 }}
          >
            <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
          </Link>
          <span className="text-[9px] font-semibold text-violet-500 dark:text-violet-400 mt-1 tracking-wide">
            Nova
          </span>
        </div>

        {/* Right items */}
        {RIGHT.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  )
}
