"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  MessageCircle,
  Phone,
  ChevronDown,
  Check,
  CheckCheck,
  Clock,
  Image,
  Mic,
  Search,
} from "lucide-react"

type Vendedor = { id: string; nome: string; userId: string }

type Conversation = {
  contactPhone: string
  contactName: string | null
  direction: "in" | "out"
  body: string
  mediaType: string
  ackStatus: number
  timestamp: string
}

type Message = {
  id: string
  direction: "in" | "out"
  body: string
  mediaType: string
  whatsappMsgId: string | null
  ackStatus: number
  timestamp: string
}

// ─── ACK icon ────────────────────────────────────────────────────────────────

function AckIcon({ status }: { status: number }) {
  if (status === 0) return <Clock className="w-3 h-3 text-slate-400" />
  if (status === 1) return <Check className="w-3 h-3 text-slate-400" />
  if (status === 2) return <CheckCheck className="w-3 h-3 text-slate-400" />
  return <CheckCheck className="w-3 h-3 text-violet-400" />
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const diff = today.getDate() - d.getDate()
  if (diff === 0 && today.getMonth() === d.getMonth()) return "Hoje"
  if (diff === 1 && today.getMonth() === d.getMonth()) return "Ontem"
  return d.toLocaleDateString("pt-BR")
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function displayName(phone: string, name: string | null) {
  return name && name.trim() ? name : phone
}

function previewBody(body: string, mediaType: string) {
  if (mediaType === "image") return "📷 Imagem"
  if (mediaType === "audio") return "🎙️ Áudio"
  return body.length > 40 ? body.slice(0, 40) + "…" : body
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatClient({ vendedores }: { vendedores: Vendedor[] }) {
  const [selectedUserId, setSelectedUserId] = useState(vendedores[0]?.userId ?? "")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [contactName, setContactName] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollConvRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollMsgRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchConversations = useCallback(async (userId: string) => {
    if (!userId) return
    setLoadingConvs(true)
    try {
      const res = await fetch(`/api/chat/${userId}`, { cache: "no-store" })
      if (res.ok) setConversations(await res.json())
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  const fetchMessages = useCallback(async (userId: string, phone: string) => {
    if (!userId || !phone) return
    setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/chat/${userId}/${encodeURIComponent(phone)}`, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json() as { contactName: string | null; messages: Message[] }
        setMessages(data.messages)
        setContactName(data.contactName)
      }
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  // Fetch conversations when userId changes
  useEffect(() => {
    setSelectedPhone(null)
    setMessages([])
    fetchConversations(selectedUserId)

    clearInterval(pollConvRef.current!)
    pollConvRef.current = setInterval(() => fetchConversations(selectedUserId), 3000)
    return () => clearInterval(pollConvRef.current!)
  }, [selectedUserId, fetchConversations])

  // Fetch messages when conversation selected
  useEffect(() => {
    if (!selectedPhone) return
    fetchMessages(selectedUserId, selectedPhone)

    clearInterval(pollMsgRef.current!)
    pollMsgRef.current = setInterval(() => fetchMessages(selectedUserId, selectedPhone), 3000)
    return () => clearInterval(pollMsgRef.current!)
  }, [selectedPhone, selectedUserId, fetchMessages])

  // Auto-scroll to bottom when messages load/update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const filtered = conversations.filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.contactPhone.includes(q) ||
      (c.contactName ?? "").toLowerCase().includes(q)
    )
  })

  const selectedVendedor = vendedores.find((v) => v.userId === selectedUserId)

  return (
    <div className="flex h-full bg-white dark:bg-[#0b0f19]">
      {/* ── Left panel: conversation list ────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-slate-200 dark:border-white/[0.06]">
        {/* Instance selector */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="relative">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="appearance-none w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 pl-3 pr-8 py-2 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer"
            >
              {vendedores.map((v) => (
                <option key={v.userId} value={v.userId}>
                  {v.nome}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-200 dark:border-white/[0.06]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-violet-500/30 transition-all"
            />
          </div>
        </div>

        {/* Conversation rows */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && conversations.length === 0 ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center px-4">
              <MessageCircle className="w-7 h-7 text-slate-300 dark:text-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-600">
                {conversations.length === 0
                  ? "Nenhuma conversa ainda. As mensagens enviadas e recebidas aparecerão aqui."
                  : "Nenhuma conversa encontrada."}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((c) => {
                const isSelected = selectedPhone === c.contactPhone
                return (
                  <motion.button
                    key={c.contactPhone}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedPhone(c.contactPhone)}
                    className={`w-full flex items-center gap-3 px-3 py-3 border-b border-slate-100 dark:border-white/[0.04] transition-colors text-left ${
                      isSelected
                        ? "bg-violet-50 dark:bg-violet-500/10"
                        : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-600/30 dark:to-indigo-600/30 flex items-center justify-center text-sm font-bold text-violet-600 dark:text-violet-300 shrink-0">
                      {(c.contactName ?? c.contactPhone)[0]?.toUpperCase() ?? "?"}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {displayName(c.contactPhone, c.contactName)}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0">
                          {fmtTime(c.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {c.direction === "out" && (
                          <span className="shrink-0">
                            <AckIcon status={c.ackStatus} />
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 dark:text-slate-500 truncate">
                          {previewBody(c.body, c.mediaType)}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Right panel: chat messages ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedPhone ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-violet-500 dark:text-violet-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Selecione uma conversa
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-600 max-w-xs">
              {selectedVendedor
                ? `Conversas de ${selectedVendedor.nome}`
                : "Escolha uma instância para ver as conversas"}
            </p>
          </div>
        ) : (
          <>
            {/* Contact header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#0b0f19] shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-600/30 dark:to-indigo-600/30 flex items-center justify-center text-xs font-bold text-violet-600 dark:text-violet-300 shrink-0">
                {(contactName ?? selectedPhone)[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {displayName(selectedPhone, contactName)}
                </p>
                <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                  <Phone className="w-3 h-3" />
                  {selectedPhone}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1 bg-slate-50 dark:bg-[#080c14]">
              {loadingMsgs && messages.length === 0 ? (
                <div className="flex justify-center py-12">
                  <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center py-12">
                  <p className="text-xs text-slate-400 dark:text-slate-600">Sem mensagens registradas.</p>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const showDate = !prev || !isSameDay(prev.timestamp, m.timestamp)
                    const isOut = m.direction === "out"

                    return (
                      <div key={m.id}>
                        {/* Date separator */}
                        {showDate && (
                          <div className="flex items-center justify-center my-3">
                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-white/[0.05] px-3 py-0.5 rounded-full">
                              {fmtDate(m.timestamp)}
                            </span>
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-0.5`}>
                          <div
                            className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm ${
                              isOut
                                ? "bg-violet-600 text-white rounded-br-sm"
                                : "bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white rounded-bl-sm"
                            }`}
                          >
                            {/* Media indicator */}
                            {m.mediaType === "image" && (
                              <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
                                <Image className="w-3.5 h-3.5" />
                                <span>Imagem</span>
                              </div>
                            )}
                            {m.mediaType === "audio" && (
                              <div className="flex items-center gap-1.5 text-xs opacity-80">
                                <Mic className="w-3.5 h-3.5" />
                                <span>Áudio</span>
                              </div>
                            )}

                            {/* Body */}
                            {m.body && (
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            )}

                            {/* Timestamp + ACK */}
                            <div className={`flex items-center gap-1 mt-1 ${isOut ? "justify-end" : "justify-start"}`}>
                              <span className={`text-[10px] ${isOut ? "text-violet-200" : "text-slate-400 dark:text-slate-500"}`}>
                                {fmtTime(m.timestamp)}
                              </span>
                              {isOut && <AckIcon status={m.ackStatus} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
