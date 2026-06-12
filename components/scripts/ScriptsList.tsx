"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { Plus, FileText, Layers, Trash2, Edit2, Clock } from "lucide-react"

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
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {templates.length > 0
            ? `${templates.length} script${templates.length !== 1 ? "s" : ""} criado${templates.length !== 1 ? "s" : ""}`
            : "Nenhum script criado ainda"}
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push("/scripts/novo")}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          Novo Script
        </motion.button>
      </div>

      {templates.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-14 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-600/10 flex items-center justify-center">
            <Layers className="w-7 h-7 text-violet-500 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Nenhum script criado</p>
            <p className="text-sm text-slate-500 mt-1">
              Crie seu primeiro script de sequência de mensagens para usar nas campanhas.
            </p>
          </div>
          <button
            onClick={() => router.push("/scripts/novo")}
            className="text-xs font-medium px-4 py-2 rounded-xl bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors"
          >
            + Criar script agora
          </button>
        </motion.div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {templates.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.2 }}
                className="group rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none p-5 flex flex-col gap-4"
              >
                {/* Icon + name */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-600/15 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{t.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
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
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-white/5">
                  <button
                    onClick={() => router.push(`/scripts/${t.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    Editar
                  </button>

                  <AnimatePresence mode="wait">
                    {confirmDelete === t.id ? (
                      <motion.div
                        key="confirm"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="flex items-center gap-1 overflow-hidden"
                      >
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs px-2 py-2 rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                          Não
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting === t.id}
                          className="text-xs font-medium px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                        >
                          Confirmar
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="delete"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setConfirmDelete(t.id)}
                        className="p-2 rounded-xl text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  )
}
