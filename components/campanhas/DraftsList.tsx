"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import {
  FileEdit,
  Copy,
  Trash2,
  Megaphone,
  Plus,
  Loader2,
  Calendar,
} from "lucide-react"

type Draft = {
  id: string
  name: string
  createdAt: string
  vendedor: { nome: string } | null
  list: { name: string; _count: { items: number } } | null
  template: { name: string } | null
}

function relativeDate(iso: string): string {
  const diff    = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours   = Math.floor(diff / 3_600_000)
  const days    = Math.floor(diff / 86_400_000)
  if (minutes < 1)  return "agora mesmo"
  if (minutes < 60) return `há ${minutes} min`
  if (hours   < 24) return `há ${hours}h`
  if (days    === 1) return "ontem"
  if (days    < 30)  return `há ${days} dias`
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function draftMeta(d: Draft): string {
  return [
    d.vendedor?.nome,
    d.list    ? `${d.list.name} · ${d.list._count.items} contatos` : null,
    d.template?.name,
  ].filter(Boolean).join("  ·  ")
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyDrafts({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-16 flex flex-col items-center gap-3 text-center"
    >
      <FileEdit className="w-8 h-8 text-slate-300 dark:text-slate-700" />
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nenhum rascunho salvo</p>
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
          Campanhas criadas sem iniciar ficam guardadas aqui.
        </p>
      </div>
      <button
        onClick={onNew}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-400 transition-colors mt-1"
      >
        Nova campanha
      </button>
    </motion.div>
  )
}

// ─── Draft row ────────────────────────────────────────────────────────────────

function DraftRow({ d, handlers }: {
  d: Draft
  handlers: {
    onEdit:      (id: string) => void
    onDuplicate: (id: string) => void
    onDelete:    (id: string) => void
    duplicating: string | null
    deleting:    string | null
    confirming:  string | null
    onConfirm:   (id: string) => void
    onCancel:    () => void
  }
}) {
  const isDuplicating = handlers.duplicating === d.id
  const isDeleting    = handlers.deleting    === d.id
  const confirming    = handlers.confirming  === d.id
  const meta          = draftMeta(d)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -6, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="group flex items-center gap-3 sm:gap-4 px-4 py-3.5 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/[0.1] transition-colors"
    >
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center shrink-0">
        <Megaphone className="w-4 h-4 text-slate-400 dark:text-slate-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 dark:text-white truncate leading-snug">
          {d.name}
        </p>
        {meta ? (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{meta}</p>
        ) : (
          <p className="text-[11px] text-slate-300 dark:text-slate-700 mt-0.5 italic">Sem configuração</p>
        )}
      </div>

      {/* Date */}
      <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-600 shrink-0">
        <Calendar className="w-3 h-3" />
        {relativeDate(d.createdAt)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Edit — always visible */}
        <button
          onClick={() => handlers.onEdit(d.id)}
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
        >
          <FileEdit className="w-3 h-3" />
          Editar
        </button>

        {/* Duplicate — visible on hover or while loading */}
        <button
          onClick={() => handlers.onDuplicate(d.id)}
          disabled={isDuplicating}
          title="Duplicar rascunho"
          className={`p-1.5 rounded-lg text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50 ${
            isDuplicating ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isDuplicating
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Copy className="w-3.5 h-3.5" />}
        </button>

        {/* Delete with inline confirm */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {confirming ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1"
              >
                <button
                  onClick={handlers.onCancel}
                  className="text-[10px] px-2 py-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap"
                >
                  Não
                </button>
                <button
                  onClick={() => handlers.onDelete(d.id)}
                  disabled={isDeleting}
                  className="flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Excluir
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="trash"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                onClick={() => handlers.onConfirm(d.id)}
                className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/[0.08] transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DraftsList({ initial }: { initial: Draft[] }) {
  const router = useRouter()
  const [drafts,        setDrafts]        = useState<Draft[]>(initial)
  const [duplicating,   setDuplicating]   = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDuplicate = async (id: string) => {
    setDuplicating(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" })
      if (!res.ok) return
      const { id: newId } = await res.json() as { id: string }
      router.push(`/campanhas/${newId}/editar`)
    } finally {
      setDuplicating(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" })
      if (res.ok) setDrafts((prev) => prev.filter((d) => d.id !== id))
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  if (drafts.length === 0) {
    return <EmptyDrafts onNew={() => router.push("/campanhas/nova")} />
  }

  const rowHandlers = {
    onEdit:      (id: string) => router.push(`/campanhas/${id}/editar`),
    onDuplicate: handleDuplicate,
    onDelete:    handleDelete,
    duplicating,
    deleting,
    confirming:  confirmDelete,
    onConfirm:   setConfirmDelete,
    onCancel:    () => setConfirmDelete(null),
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {drafts.length} rascunho{drafts.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => router.push("/campanhas/nova")}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Campanha
        </button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {drafts.map((d) => (
            <DraftRow key={d.id} d={d} handlers={rowHandlers} />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}
