"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, UserPlus, Phone, User, List, AlertTriangle, CheckCircle2, Clock, Building2 } from "lucide-react"

type ContactList = { id: string; name: string }

type ExistingContact = {
  id: string
  phone: string
  name: string | null
  createdAt: string
  lastContactedAt: string | null
  listItems: { list: { id: string; name: string; vendedor: { nome: string } | null } }[]
  messages: {
    status: string
    sentAt: string | null
    campaign: { name: string; status: string; vendedor: { nome: string } | null } | null
  }[]
}

type Props = {
  lists: ContactList[]
  onClose: () => void
  onCreated: () => void
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando", SENDING: "Enviando", SENT: "Enviado",
  COMPLETED: "Concluído", FAILED: "Falhou",
}

export function AddContactModal({ lists, onClose, onCreated }: Props) {
  const [phone, setPhone]   = useState("")
  const [name, setName]     = useState("")
  const [listId, setListId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingContact | null>(null)

  const handleSubmit = async () => {
    if (!phone.trim()) { setError("Informe o número de telefone"); return }
    setLoading(true)
    setError(null)
    setExisting(null)

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined, listId: listId || undefined }),
    })

    const data = await res.json()
    setLoading(false)

    if (res.status === 409) {
      setExisting(data.contact as ExistingContact)
      return
    }
    if (!res.ok) {
      setError(data.error ?? "Erro ao adicionar contato")
      return
    }

    onCreated()
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-full max-w-md bg-white dark:bg-[#0d1120] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden"
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                <UserPlus className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">
                Adicionar contato
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* ── Formulário ─────────────────────────────────── */}
            {!existing && (
              <>
                <div className="space-y-3">
                  {/* Telefone */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Telefone *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
                        placeholder="5567999998888"
                        className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Nome */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                      Nome <span className="font-normal normal-case text-slate-400">(opcional)</span>
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
                        placeholder="Nome completo"
                        className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                      />
                    </div>
                  </div>

                  {/* Lista */}
                  {lists.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                        Adicionar à lista <span className="font-normal normal-case text-slate-400">(opcional)</span>
                      </label>
                      <div className="relative">
                        <List className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <select
                          value={listId}
                          onChange={(e) => setListId(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 text-[13px] bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all appearance-none"
                        >
                          <option value="">Nenhuma lista</option>
                          {lists.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-[12px] text-red-600 dark:text-red-400">{error}</span>
                  </div>
                )}

                <button
                  onClick={() => void handleSubmit()}
                  disabled={loading || !phone.trim()}
                  className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors"
                >
                  {loading ? "Verificando…" : "Adicionar contato"}
                </button>
              </>
            )}

            {/* ── Contato já existe ───────────────────────────── */}
            {existing && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">Contato já cadastrado</p>
                    <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70">
                      {existing.name ? `${existing.name} · ` : ""}{existing.phone}
                    </p>
                  </div>
                </div>

                {/* Listas */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <List className="w-3 h-3" /> Listas
                  </p>
                  {existing.listItems.length === 0 ? (
                    <p className="text-[12px] text-slate-400 dark:text-slate-600 italic">Não está em nenhuma lista</p>
                  ) : (
                    <div className="space-y-1.5">
                      {existing.listItems.map((li, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]">
                          <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200">{li.list.name}</span>
                          {li.list.vendedor && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Building2 className="w-3 h-3" />
                              {li.list.vendedor.nome}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Campanhas recentes */}
                {existing.messages.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Campanhas recentes
                    </p>
                    <div className="space-y-1.5">
                      {existing.messages.map((m, i) => (
                        <div key={i} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.05]">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                              {m.campaign?.name ?? "—"}
                            </span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              m.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                              m.status === "FAILED"    ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" :
                              "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500"
                            }`}>
                              {STATUS_LABEL[m.status] ?? m.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {m.campaign?.vendedor && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Building2 className="w-3 h-3" />
                                {m.campaign.vendedor.nome}
                              </span>
                            )}
                            {m.sentAt && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="w-3 h-3" />
                                {fmtDate(m.sentAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cadastrado em */}
                <p className="text-[11px] text-slate-400 text-center">
                  Cadastrado em {fmtDate(existing.createdAt)}
                  {existing.lastContactedAt && (
                    <> · Último envio: {fmtDate(existing.lastContactedAt)}</>
                  )}
                </p>

                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-300 text-[13px] font-semibold transition-colors"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
