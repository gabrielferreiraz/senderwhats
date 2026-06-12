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
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {vendedores.length > 0
            ? `${vendedores.length} vendedor${vendedores.length !== 1 ? "es" : ""} cadastrado${vendedores.length !== 1 ? "s" : ""}`
            : "Nenhum vendedor cadastrado ainda"}
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus className="w-4 h-4" />
          Adicionar Vendedor
        </motion.button>
      </div>

      {/* Grid */}
      {vendedores.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 p-14 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-600/10 flex items-center justify-center">
            <Smartphone className="w-7 h-7 text-violet-500 dark:text-violet-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Nenhum vendedor conectado</p>
            <p className="text-sm text-slate-500 mt-1">
              Clique em &quot;Adicionar Vendedor&quot; para conectar o primeiro WhatsApp.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs font-medium px-4 py-2 rounded-xl bg-violet-50 dark:bg-violet-600/10 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-600/20 transition-colors"
          >
            + Conectar agora
          </button>
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
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
