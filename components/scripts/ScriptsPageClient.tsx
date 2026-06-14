"use client"

import { ScriptsList } from "./ScriptsList"

type Template = { id: string; name: string; createdAt: string; _count: { steps: number } }

type Props = {
  templates: Template[]
}

export function ScriptsPageClient({ templates }: Props) {
  return (
    <div className="max-w-7xl mx-auto">
      <ScriptsList initial={templates} />
    </div>
  )
}
