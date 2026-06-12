"use client"

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Trash2, X } from "lucide-react"

type Props = {
  list: { id: string; name: string; count: number } | null
  onConfirm: (id: string) => Promise<void>
  onClose: () => void
  deleting: boolean
}

export function DeleteListModal({ list, onConfirm, onClose, deleting }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose, deleting])

  return (
    <AnimatePresence>
      {list && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !deleting && onClose()}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28, duration: 0.22 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md bg-white dark:bg-[#0f1117] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              {/* Danger accent stripe */}
              <div className="h-1 bg-gradient-to-r from-rose-600 via-rose-500 to-orange-500" />

              <div className="p-6">
                {/* Icon + Title row */}
                <div className="flex items-start gap-4 mb-5">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.08, type: "spring", stiffness: 400, damping: 20 }}
                    className="shrink-0 w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/25 flex items-center justify-center"
                  >
                    <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                  </motion.div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Excluir Lista</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate">&ldquo;{list.name}&rdquo;</p>
                  </div>
                  <button
                    onClick={() => !deleting && onClose()}
                    disabled={deleting}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-30"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Warning box */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/[0.07] p-4 space-y-2.5 mb-6"
                >
                  <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest">
                    Atenção — ação irreversível
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                      <span className="text-rose-500 dark:text-rose-400 shrink-0 mt-px">•</span>
                      <span>
                        Os{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {list.count.toLocaleString("pt-BR")} contato{list.count !== 1 ? "s" : ""}
                        </span>{" "}
                        desta lista serão removidos.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                      <span className="text-rose-500 dark:text-rose-400 shrink-0 mt-px">•</span>
                      <span>
                        Contatos que{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">não pertencem a outra lista</span>{" "}
                        e{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">não têm histórico de envios</span>{" "}
                        serão deletados permanentemente do banco.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-slate-500 dark:text-slate-400">
                      <span className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-px">•</span>
                      <span>
                        Contatos com campanhas ou em outras listas serão preservados.
                      </span>
                    </li>
                  </ul>
                </motion.div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => !deleting && onClose()}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20 transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onConfirm(list.id)}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 shadow-lg shadow-rose-900/30"
                  >
                    {deleting ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                        />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Lista
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
