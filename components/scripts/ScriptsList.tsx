"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { Plus, Layers, Trash2, Edit2, Clock } from "lucide-react"

type Template = {
  id: string
  name: string
  createdAt: string
  _count: { steps: number }
}

type Props = {
  initial: Template[]
}

export function ScriptsList({ initial }: Props) {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>(initial)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/templates/${id}`, { method: "DELETE" })
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } finally {
      setDeleting(null)
      setConfirmDelete(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {templates.length > 0
            ? `${templates.length} script${templates.length !== 1 ? "s" : ""}`
            : "Nenhum script criado"}
        </p>
        <button
          onClick={() => router.push("/scripts/novo")}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo Script
        </button>
      </div>

      {templates.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-16 flex flex-col items-center gap-3 text-center"
        >
          <Layers className="w-8 h-8 text-slate-300 dark:text-slate-700" />
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nenhum script criado</p>
            <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
              Crie sequências de mensagens para reutilizar nas campanhas.
            </p>
          </div>
          <button
            onClick={() => router.push("/scripts/novo")}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-400 transition-colors mt-1"
          >
            Criar agora
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence>
            {templates.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="group rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4 flex flex-col gap-3"
              >
                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white text-sm truncate leading-snug">{t.name}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {t._count.steps} passo{t._count.steps !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-white/[0.04]">
                  <button
                    onClick={() => router.push(`/scripts/${t.id}`)}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar
                  </button>

                  <div className="ml-auto">
                    <AnimatePresence mode="wait">
                      {confirmDelete === t.id ? (
                        <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1"
                        >
                          <button onClick={() => setConfirmDelete(null)}
                            className="text-[10px] px-2 py-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                            Não
                          </button>
                          <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id}
                            className="text-[10px] font-medium px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors">
                            Excluir
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button key="delete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          onClick={() => setConfirmDelete(t.id)}
                          className="p-1 rounded-md text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/[0.08] transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </>
  )
}
