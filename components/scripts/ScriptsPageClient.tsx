"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Layers, Repeat } from "lucide-react"
import { ScriptsList } from "./ScriptsList"
import { RemarketingPanel } from "@/components/remarketing/RemarketingPanel"

type Template = { id: string; name: string; createdAt: string; _count: { steps: number } }
type Vendedor = { id: string; nome: string; userId: string }

type Props = {
  templates: Template[]
  vendedores: Vendedor[]
}

const TABS = [
  { id: "scripts",     label: "Scripts",     Icon: Layers },
  { id: "remarketing", label: "Remarketing", Icon: Repeat },
] as const

type TabId = (typeof TABS)[number]["id"]

export function ScriptsPageClient({ templates, vendedores }: Props) {
  const [tab, setTab] = useState<TabId>("scripts")

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 mb-6 border-b border-slate-200 dark:border-white/[0.06]">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
              tab === id
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {tab === id && (
              <motion.span
                layoutId="scripts-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-px bg-violet-500"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "scripts" && <ScriptsList initial={templates} />}
      {tab === "remarketing" && (
        <RemarketingPanel
          templates={templates.map((t) => ({ id: t.id, name: t.name }))}
          vendedores={vendedores}
        />
      )}
    </div>
  )
}
