"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Phone,
  Tag,
  Database,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit2,
  Check,
  MessageCircle,
  ChevronDown,
} from "lucide-react"

type ContactDetail = {
  id: string
  phone: string
  name: string | null
  tags: string[]
  variables: Record<string, string> | null
  createdAt: string
  lastContactedAt: string | null
  listItems: { list: { id: string; name: string } }[]
  messages: Array<{
    id: string
    status: string
    currentStep: number
    sentAt: string | null
    nextSendAt: string | null
    failureReason: string | null
    campaign: { id: string; name: string } | null
    template: { name: string } | null
  }>
}

const STATUS_MAP: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  SENT:      { label: "Enviado",   icon: <CheckCircle className="w-3 h-3" />, cls: "text-emerald-500" },
  COMPLETED: { label: "Concluído", icon: <CheckCircle className="w-3 h-3" />, cls: "text-sky-500" },
  FAILED:    { label: "Falhou",    icon: <AlertCircle className="w-3 h-3" />, cls: "text-rose-500" },
  PENDING:   { label: "Pendente",  icon: <Clock className="w-3 h-3" />,       cls: "text-amber-500" },
  SENDING:   { label: "Enviando",  icon: <Clock className="w-3 h-3" />,       cls: "text-violet-500" },
  SKIPPED:   { label: "Pulado",    icon: null,                                 cls: "text-slate-400" },
}

type Vendedor = { id: string; nome: string; userId: string }

export function ContactDrawer({
  contactId,
  onClose,
  onNameChange,
  vendedores = [],
}: {
  contactId: string
  onClose: () => void
  onNameChange?: (id: string, name: string) => void
  vendedores?: Vendedor[]
}) {
  const router = useRouter()
  const [contact, setContact] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [savingName, setSavingName] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const [showChatPicker, setShowChatPicker] = useState(false)
  const [chatUserId, setChatUserId] = useState(vendedores[0]?.userId ?? "")

  useEffect(() => {
    setLoading(true)
    setContact(null)
    fetch(`/api/contacts/${contactId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: ContactDetail) => {
        setContact(d)
        setNameInput(d.name ?? "")
      })
      .finally(() => setLoading(false))
  }, [contactId])

  useEffect(() => {
    if (editingName) nameRef.current?.focus()
  }, [editingName])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const saveName = async () => {
    if (!contact || !nameInput.trim()) { setEditingName(false); return }
    if (nameInput.trim() === (contact.name ?? "")) { setEditingName(false); return }
    setSavingName(true)
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.trim() }),
    })
    if (res.ok) {
      const updated = await res.json() as { name: string }
      setContact((prev) => prev ? { ...prev, name: updated.name } : prev)
      onNameChange?.(contact.id, updated.name)
    }
    setSavingName(false)
    setEditingName(false)
  }

  const vars = contact?.variables ? Object.entries(contact.variables) : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-[420px] bg-white dark:bg-[#0b0f19] border-l border-slate-200 dark:border-white/[0.06] shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Detalhes do contato</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : !contact ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
            Contato não encontrado
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Identity block */}
            <div className="px-5 py-5 border-b border-slate-100 dark:border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-600/30 dark:to-indigo-600/30 flex items-center justify-center text-lg font-bold text-violet-600 dark:text-violet-300 shrink-0">
                  {(contact.name ?? contact.phone)?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={nameRef}
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName()
                          if (e.key === "Escape") setEditingName(false)
                        }}
                        className="text-base font-semibold bg-transparent border-b border-violet-500 focus:outline-none text-slate-900 dark:text-white flex-1 min-w-0"
                      />
                      <button
                        onClick={saveName}
                        disabled={savingName}
                        className="text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingName(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingName(true)}
                      className="group flex items-center gap-1.5 text-left w-full"
                    >
                      <span className="text-base font-semibold text-slate-900 dark:text-white truncate">
                        {contact.name ?? (
                          <span className="text-slate-400 italic font-normal text-sm">Sem nome</span>
                        )}
                      </span>
                      <Edit2 className="w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-violet-400 transition-colors shrink-0" />
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 text-slate-500 dark:text-slate-400">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span className="font-mono text-xs">{contact.phone}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider mb-1">
                    Criado em
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {new Date(contact.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {contact.lastContactedAt && (
                  <div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider mb-1">
                      Último contato
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">
                      {new Date(contact.lastContactedAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                )}
              </div>

              {contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {contact.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Iniciar conversa */}
            {vendedores.length > 0 && contact && (
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.04]">
                <button
                  onClick={() => setShowChatPicker((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-semibold transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Iniciar conversa
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showChatPicker ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {showChatPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Selecione a instância (vendedor)
                        </p>
                        <div className="relative">
                          <select
                            value={chatUserId}
                            onChange={(e) => setChatUserId(e.target.value)}
                            className="w-full appearance-none bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-[13px] text-slate-900 dark:text-white pl-3 pr-8 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
                          >
                            {vendedores.map((v) => (
                              <option key={v.userId} value={v.userId}>
                                {v.nome}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                        <button
                          disabled={!chatUserId}
                          onClick={() => {
                            router.push(`/chat?phone=${encodeURIComponent(contact.phone)}&userId=${encodeURIComponent(chatUserId)}`)
                            onClose()
                          }}
                          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors"
                        >
                          Abrir chat
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Variables */}
            {vars.length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.04]">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                  <Database className="w-3 h-3" />
                  Variáveis ({vars.length})
                </p>
                <div className="space-y-1.5">
                  {vars.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-mono text-violet-600 dark:text-violet-400 shrink-0">
                        {`{${k}}`}
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 text-right truncate max-w-[200px]">
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lists */}
            {contact.listItems.length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.04]">
                <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                  <Tag className="w-3 h-3" />
                  Listas ({contact.listItems.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {contact.listItems.map(({ list }) => (
                    <span
                      key={list.id}
                      className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-400"
                    >
                      {list.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Message history */}
            <div className="px-5 py-4">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Histórico ({contact.messages.length})
              </p>
              {contact.messages.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-600">Sem envios registrados.</p>
              ) : (
                <div className="space-y-2">
                  {contact.messages.map((m) => {
                    const cfg = STATUS_MAP[m.status] ?? { label: m.status, icon: null, cls: "text-slate-500" }
                    return (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.04]"
                      >
                        <div className={`mt-0.5 shrink-0 ${cfg.cls}`}>{cfg.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                              {m.campaign?.name ?? "Campanha removida"}
                            </span>
                            <span className={`text-[10px] font-semibold shrink-0 ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          </div>
                          {m.template && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 truncate">
                              Script: {m.template.name} · Passo {m.currentStep}
                            </p>
                          )}
                          {m.sentAt && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
                              {new Date(m.sentAt).toLocaleString("pt-BR")}
                            </p>
                          )}
                          {m.failureReason && (
                            <p className="text-[10px] text-rose-500 dark:text-rose-400 mt-0.5 truncate">
                              {m.failureReason}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}
