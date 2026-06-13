"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Smartphone } from "lucide-react"
import { VendedorCard } from "./VendedorCard"
import { AddVendedorModal } from "./AddVendedorModal"
import { InsightDrawer } from "./InsightDrawer"

type VendedorData = {
  id: string
  nome: string
  userId: string
  ativo: boolean
  createdAt: string
  _count: { campanhas: number; listas: number }
}

type Target = { userId: string; nome: string } | null

type Props = {
  initial: VendedorData[]
}

export function VendedoresGrid({ initial }: Props) {
  const [vendedores, setVendedores] = useState<VendedorData[]>(initial)
  const [showAdd, setShowAdd] = useState(false)
  const [reconnect, setReconnect] = useState<Target>(null)
  const [insightTarget, setInsightTarget] = useState<Target>(null)

  const handleDelete = (userId: string) => {
    setVendedores((prev) => prev.filter((v) => v.userId !== userId))
  }

  const handleReconnect = (userId: string, nome: string) => {
    setReconnect({ userId, nome })
  }

  const handleViewInsights = (userId: string, nome: string) => {
    setInsightTarget({ userId, nome })
  }

  const handleSuccess = (newVendedor: { id: string; nome: string; userId: string }) => {
    setShowAdd(false)
    setReconnect(null)
    setVendedores((prev) => {
      const exists = prev.some((v) => v.userId === newVendedor.userId)
      if (exists) return prev
      return [
        {
          ...newVendedor,
          ativo: true,
          createdAt: new Date().toISOString(),
          _count: { campanhas: 0, listas: 0 },
        },
        ...prev,
      ]
    })
  }

  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {vendedores.length > 0
            ? `${vendedores.length} instância${vendedores.length !== 1 ? "s" : ""}`
            : "Nenhuma instância conectada"}
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar Instância
        </button>
      </div>

      {/* Grid */}
      {vendedores.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.07] p-16 flex flex-col items-center gap-3 text-center"
        >
          <Smartphone className="w-8 h-8 text-slate-300 dark:text-slate-700" />
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nenhuma instância conectada</p>
            <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
              Conecte o primeiro WhatsApp para começar a disparar mensagens.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-400 transition-colors mt-1"
          >
            Conectar agora
          </button>
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          <AnimatePresence>
            {vendedores.map((v) => (
              <VendedorCard
                key={v.id}
                id={v.id}
                nome={v.nome}
                userId={v.userId}
                campanhasCount={v._count.campanhas}
                listasCount={v._count.listas}
                onDelete={handleDelete}
                onReconnect={handleReconnect}
                onViewInsights={handleViewInsights}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Modal: Add */}
      <AnimatePresence>
        {showAdd && (
          <AddVendedorModal
            mode="add"
            onClose={() => setShowAdd(false)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Modal: Reconnect */}
      <AnimatePresence>
        {reconnect && (
          <AddVendedorModal
            mode="reconnect"
            vendedor={reconnect}
            onClose={() => setReconnect(null)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>

      {/* Drawer: Insights */}
      <AnimatePresence>
        {insightTarget && (
          <InsightDrawer
            userId={insightTarget.userId}
            nome={insightTarget.nome}
            onClose={() => setInsightTarget(null)}
            onDisconnected={() => handleDelete(insightTarget.userId)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
