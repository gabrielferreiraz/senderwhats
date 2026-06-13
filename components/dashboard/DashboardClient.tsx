"use client"

import { useState, useTransition } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Send,
  Megaphone,
  Users,
  TrendingUp,
  ChevronDown,
  Trophy,
  Loader2,
  UserPlus,
  MessageCircle,
  Repeat2,
  Clock,
} from "lucide-react"
import { StatsCard } from "./StatsCard"
import { VolumeChart } from "./VolumeChart"
import { FunnelMetrics } from "./FunnelMetrics"

type DayData = { day: string; enviadas: number; falhas: number }
type FunnelData = { enviadas: number; falhas: number; pendentes: number; taxaSucesso: number }
type VendorRank = { id: string; nome: string; userId: string; sent: number; failed: number; taxaSucesso: number }
type RemarketingStats = { totalLeads: number; replied: number; pending: number; taxaResposta: number }

type DashData = {
  sentInRange: number
  failedInRange: number
  activeCampaigns: number
  totalContacts: number
  chartData: DayData[]
  funnel: FunnelData
  vendorRanking: VendorRank[]
  remarketing: RemarketingStats
}

type Vendedor = { id: string; nome: string; userId: string }

type Props = {
  initial: DashData
  vendedores: Vendedor[]
}

type DateRange = "today" | "7d" | "30d"

const RANGE_LABELS: Record<DateRange, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias" }
const SENT_LABEL: Record<DateRange, string> = {
  today: "Enviadas Hoje",
  "7d": "Enviadas (7 dias)",
  "30d": "Enviadas (30 dias)",
}
const CHART_SUBTITLE: Record<DateRange, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
}

export function DashboardClient({ initial, vendedores }: Props) {
  const [data, setData] = useState<DashData>(initial)
  const [selectedVendorId, setSelectedVendorId] = useState<string>("")
  const [dateRange, setDateRange] = useState<DateRange>("7d")
  const [isPending, startTransition] = useTransition()

  function fetchData(vendorId: string, range: DateRange) {
    startTransition(async () => {
      const params = new URLSearchParams()
      if (vendorId) params.set("vendedorId", vendorId)
      params.set("range", range)
      try {
        const res = await fetch(`/api/dashboard?${params}`, { cache: "no-store" })
        if (res.ok) setData(await res.json())
      } catch {
        // keep current data on error
      }
    })
  }

  const handleVendorChange = (vendorId: string) => {
    setSelectedVendorId(vendorId)
    fetchData(vendorId, dateRange)
  }

  const handleRangeChange = (range: DateRange) => {
    setDateRange(range)
    fetchData(selectedVendorId, range)
  }

  const selectedVendor = vendedores.find((v) => v.id === selectedVendorId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header: filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {selectedVendor ? selectedVendor.nome : "Todos os vendedores"}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range pills */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] rounded-lg p-0.5 border border-slate-200 dark:border-white/[0.06]">
            {(["today", "7d", "30d"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => handleRangeChange(range)}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${
                  dateRange === range
                    ? "bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {RANGE_LABELS[range]}
              </button>
            ))}
          </div>

          {/* Vendor selector */}
          <div className="relative">
            {isPending && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-3 h-3 text-violet-500 dark:text-violet-400 animate-spin" />
              </div>
            )}
            <select
              value={selectedVendorId}
              onChange={(e) => handleVendorChange(e.target.value)}
              className={`appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500/40 transition-all pr-7 py-1.5 ${isPending ? "pl-8" : "pl-3"}`}
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                Todos os vendedores
              </option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {v.nome}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <motion.div
        key={`${selectedVendorId}-${dateRange}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <StatsCard
          label={SENT_LABEL[dateRange]}
          value={data.sentInRange.toLocaleString("pt-BR")}
          Icon={Send}
          iconColor="violet"
          sub={data.failedInRange > 0 ? `${data.failedInRange} falha(s) no período` : "Sem falhas no período"}
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
          <VolumeChart data={data.chartData} subtitle={CHART_SUBTITLE[dateRange]} />
        </div>
        <FunnelMetrics data={data.funnel} />
      </div>

      {/* Remarketing section */}
      <div>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-3">Remarketing</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard
            label="Leads Enfileirados"
            value={data.remarketing.totalLeads.toLocaleString("pt-BR")}
            Icon={UserPlus}
            iconColor="indigo"
            sub="Criados no período"
          />
          <StatsCard
            label="Responderam"
            value={data.remarketing.replied.toLocaleString("pt-BR")}
            Icon={MessageCircle}
            iconColor="emerald"
            sub="Leads que responderam"
          />
          <StatsCard
            label="Taxa de Resposta"
            value={`${data.remarketing.taxaResposta}%`}
            Icon={Repeat2}
            iconColor="violet"
            sub="Responderam / Total"
          />
          <StatsCard
            label="Follow-ups Pendentes"
            value={data.remarketing.pending.toLocaleString("pt-BR")}
            Icon={Clock}
            iconColor="rose"
            sub="Aguardando próximo envio"
          />
        </div>
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
              className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5"
            >
              <div className="flex items-center gap-2 mb-5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Ranking de Vendedores</p>
              </div>
              <div className="space-y-3">
                {data.vendorRanking.map((v, i) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className={`w-4 text-center text-[10px] font-bold shrink-0 tabular-nums ${
                      i === 0 ? "text-amber-500" : "text-slate-400 dark:text-slate-600"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{v.nome}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                            {v.sent.toLocaleString("pt-BR")}
                          </span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            v.taxaSucesso >= 90
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : v.taxaSucesso >= 70
                              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          }`}>
                            {v.taxaSucesso}%
                          </span>
                        </div>
                      </div>
                      <div className="h-0.5 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${data.vendorRanking[0] ? (v.sent / data.vendorRanking[0].sent) * 100 : 0}%` }}
                          transition={{ duration: 0.5, delay: i * 0.05 }}
                          className="h-full bg-violet-500 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-ranking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5 flex flex-col items-center justify-center gap-2 text-center"
            >
              <Trophy className="w-5 h-5 text-slate-300 dark:text-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-600">Nenhum disparo realizado ainda.</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick actions */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4">Acesso rápido</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/instancias", label: "Conectar instância", sub: "WhatsApp" },
              { href: "/contatos", label: "Importar contatos", sub: "CSV / Planilha" },
              { href: "/campanhas/nova", label: "Nova campanha", sub: "Disparo em massa" },
              { href: "/scripts/novo", label: "Criar script", sub: "Sequência de msgs" },
            ].map(({ href, label, sub }) => (
              <a
                key={href}
                href={href}
                className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/[0.06] hover:border-violet-300 dark:hover:border-violet-500/30 hover:bg-violet-50 dark:hover:bg-violet-500/[0.04] transition-colors group"
              >
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">{label}</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-600">{sub}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
