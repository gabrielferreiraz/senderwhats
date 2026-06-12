"use client"

import { useState, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Megaphone, Users, TrendingUp, ChevronDown, Trophy, Loader2 } from "lucide-react"
import { StatsCard } from "./StatsCard"
import { VolumeChart } from "./VolumeChart"
import { FunnelMetrics } from "./FunnelMetrics"

type DayData = { day: string; enviadas: number; falhas: number }
type FunnelData = { enviadas: number; falhas: number; pendentes: number; taxaSucesso: number }
type VendorRank = { id: string; nome: string; userId: string; sent: number; failed: number; taxaSucesso: number }
type DashData = {
  sentToday: number
  failedToday: number
  activeCampaigns: number
  totalContacts: number
  chartData: DayData[]
  funnel: FunnelData
  vendorRanking: VendorRank[]
}

type Vendedor = { id: string; nome: string; userId: string }

type Props = {
  initial: DashData
  vendedores: Vendedor[]
}

export function DashboardClient({ initial, vendedores }: Props) {
  const [data, setData] = useState<DashData>(initial)
  const [selectedVendorId, setSelectedVendorId] = useState<string>("")
  const [isPending, startTransition] = useTransition()

  const handleVendorChange = (vendorId: string) => {
    setSelectedVendorId(vendorId)
    startTransition(async () => {
      const url = vendorId ? `/api/dashboard?vendedorId=${vendorId}` : "/api/dashboard"
      try {
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) setData(await res.json())
      } catch {
        // keep current data on error
      }
    })
  }

  const selectedVendor = vendedores.find((v) => v.id === selectedVendorId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Vendor selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedVendor ? `Exibindo dados de ${selectedVendor.nome}` : "Todos os vendedores"}
          </p>
        </div>
        <div className="relative">
          {isPending && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 animate-spin" />
            </div>
          )}
          <select
            value={selectedVendorId}
            onChange={(e) => handleVendorChange(e.target.value)}
            className={`appearance-none bg-white dark:bg-white/[0.05] border border-slate-300 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/40 transition-all pr-8 py-2.5 ${isPending ? "pl-9" : "pl-4"}`}
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Todos os Vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                {v.nome}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* KPI Cards */}
      <motion.div
        key={selectedVendorId || "all"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <StatsCard
          label="Enviadas Hoje"
          value={data.sentToday.toLocaleString("pt-BR")}
          Icon={Send}
          iconColor="violet"
          sub={data.failedToday > 0 ? `${data.failedToday} falha(s) hoje` : "Sem falhas hoje"}
        />
        <StatsCard
          label="Campanhas Ativas"
          value={data.activeCampaigns}
          Icon={Megaphone}
          iconColor="indigo"
          sub="Em execução agora"
        />
        <StatsCard
          label="Total de Contatos"
          value={data.totalContacts.toLocaleString("pt-BR")}
          Icon={Users}
          iconColor="emerald"
          sub="Na base de dados"
        />
        <StatsCard
          label="Taxa de Sucesso"
          value={`${data.funnel.taxaSucesso}%`}
          Icon={TrendingUp}
          iconColor="rose"
          sub="Enviadas / Total disparadas"
        />
      </motion.div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <VolumeChart data={data.chartData} />
        </div>
        <FunnelMetrics data={data.funnel} />
      </div>

      {/* Vendor ranking + Quick actions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Vendor ranking */}
        <AnimatePresence mode="wait">
          {data.vendorRanking.length > 0 ? (
            <motion.div
              key="ranking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Ranking de Vendedores</p>
              </div>
              <div className="space-y-2">
                {data.vendorRanking.map((v, i) => (
                  <motion.div
                    key={v.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3"
                  >
                    <span
                      className={`w-5 text-center text-xs font-bold shrink-0 ${
                        i === 0
                          ? "text-amber-500 dark:text-amber-400"
                          : i === 1
                          ? "text-slate-500 dark:text-slate-300"
                          : i === 2
                          ? "text-orange-500 dark:text-orange-400"
                          : "text-slate-400 dark:text-slate-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{v.nome}</span>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {v.sent.toLocaleString("pt-BR")} envios
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              v.taxaSucesso >= 90
                                ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : v.taxaSucesso >= 70
                                ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {v.taxaSucesso}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${data.vendorRanking[0] ? (v.sent / data.vendorRanking[0].sent) * 100 : 0}%`,
                          }}
                          transition={{ duration: 0.5, delay: i * 0.05 }}
                          className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full"
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-ranking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none p-5 flex flex-col items-center justify-center gap-2 text-center"
            >
              <Trophy className="w-6 h-6 text-slate-300 dark:text-slate-700" />
              <p className="text-sm text-slate-400 dark:text-slate-600">
                Nenhum disparo realizado ainda.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick actions */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] shadow-sm dark:shadow-none p-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-3">
            Ações Rápidas
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { href: "/instancias", label: "Conectar instância" },
              { href: "/contatos", label: "Importar contatos" },
              { href: "/campanhas", label: "Nova campanha" },
              { href: "/scripts", label: "Criar script" },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-xs font-medium px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
