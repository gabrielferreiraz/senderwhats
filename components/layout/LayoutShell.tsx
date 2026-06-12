"use client"

import { useState } from "react"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { MobileDrawer } from "./MobileDrawer"
import { MobileNav } from "./MobileNav"

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-full">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 pb-28 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile slide-in drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Mobile bottom navigation */}
      <MobileNav />
    </div>
  )
}
