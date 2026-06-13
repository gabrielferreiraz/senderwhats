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
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200 dark:border-white/5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === id
                ? "text-violet-700 dark:text-violet-300"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {tab === id && (
              <motion.span
                layoutId="scripts-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-t-full"
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
