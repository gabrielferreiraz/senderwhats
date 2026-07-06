"use client"

import { useCallback, useEffect, useRef, useState, useMemo } from "react"
import {
  MessageCircle,
  Phone,
  Check,
  CheckCheck,
  Clock,
  Image,
  Mic,
  Search,
  Video,
  FileText,
  Smile,
  ChevronDown,
  ArrowLeft,
  X,
  SendHorizonal,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const GRADIENTS = [
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
  "from-cyan-500 to-sky-600",
  "from-lime-500 to-green-600",
]

function avatarGrad(str: string): string {
  const n = [...str].reduce((a, c) => a + c.charCodeAt(0), 0)
  return GRADIENTS[n % GRADIENTS.length]!
}

function initials(name: string | null, phone: string): string {
  if (name?.trim()) {
    const p = name.trim().split(/\s+/)
    return p.length >= 2
      ? (p[0]![0]! + p[1]![0]!).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  return phone.slice(-2)
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today.getTime() - msgDay.getTime()) / 86_400_000)
  if (diff === 0) return "Hoje"
  if (diff === 1) return "Ontem"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.length === 13 && d.startsWith("55"))
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 5)} ${d.slice(5, 9)}-${d.slice(9)}`
  if (d.length === 12 && d.startsWith("55"))
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  // JID ou ID interno do WhatsApp — trunca para não poluir a UI
  if (d.length > 13) return `+${d.slice(0, 4)}…${d.slice(-4)}`
  return `+${d}`
}

function displayName(phone: string, name: string | null) {
  return name?.trim() ? name.trim() : fmtPhone(phone)
}

function previewBody(body: string, mediaType: string) {
  if (mediaType === "image")    return body ? `📷 ${body}` : "📷 Imagem"
  if (mediaType === "audio")    return "🎙️ Áudio"
  if (mediaType === "video")    return body ? `🎥 ${body}` : "🎥 Vídeo"
  if (mediaType === "document") return body ? `📄 ${body}` : "📄 Documento"
  if (mediaType === "sticker" || mediaType === "media") return "🖼️ Mídia"
  return body
}

// ─── Message grouping ─────────────────────────────────────────────────────────

const GROUP_GAP = 3 * 60 * 1000 // 3 min

function msgMeta(msgs: Message[], i: number) {
  const m = msgs[i]!
  const ts = +new Date(m.timestamp)
  const prev = msgs[i - 1]
  const next = msgs[i + 1]
  const cont = (a: Message, b: Message) =>
    a.direction === b.direction && Math.abs(+new Date(b.timestamp) - +new Date(a.timestamp)) < GROUP_GAP
  return {
    isFirst: !prev || !cont(prev, m),
    isLast:  !next || !cont(m, next),
  }
}

// ─── ACK ─────────────────────────────────────────────────────────────────────

// dim=true → dentro da bolha (cores claras sobre fundo roxo)
// dim=false → na lista de conversas (cores sobre fundo branco/escuro)
function AckIcon({ n, dim = false }: { n: number; dim?: boolean }) {
  if (n === -1) return <X className="w-3 h-3 text-red-400" />
  if (n === 0)  return <Clock      className={`w-3 h-3 ${dim ? "text-violet-200/70" : "text-slate-400"}`} />
  if (n === 1)  return <Check      className={`w-3 h-3 ${dim ? "text-violet-200/80" : "text-slate-400"}`} />
  if (n === 2)  return <CheckCheck className={`w-3 h-3 ${dim ? "text-violet-200/80" : "text-slate-400"}`} />
  // n >= 3 → lido (azul — igual ao WhatsApp)
  return <CheckCheck className={`w-3 h-3 ${dim ? "text-sky-300" : "text-sky-500"}`} />
}

// ─── Media badge ──────────────────────────────────────────────────────────────

function MediaBadge({ type, out }: { type: string; out: boolean }) {
  const cls = `flex items-center gap-1.5 text-[11px] font-medium mb-1 ${out ? "text-violet-200" : "text-slate-400 dark:text-slate-500"}`
  if (type === "image")                     return <div className={cls}><Image    className="w-3.5 h-3.5" /><span>Imagem</span></div>
  if (type === "audio")                     return <div className={cls}><Mic      className="w-3.5 h-3.5" /><span>Áudio</span></div>
  if (type === "video")                     return <div className={cls}><Video    className="w-3.5 h-3.5" /><span>Vídeo</span></div>
  if (type === "document")                  return <div className={cls}><FileText className="w-3.5 h-3.5" /><span>Documento</span></div>
  if (type === "sticker" || type === "media") return <div className={cls}><Smile    className="w-3.5 h-3.5" /><span>Mídia</span></div>
  return null
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  const s = sm ? "w-3.5 h-3.5 border-[1.5px]" : "w-5 h-5 border-2"
  return <div className={`${s} border-violet-500/30 border-t-violet-500 rounded-full animate-spin`} />
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatClient({ vendedores }: { vendedores: Vendedor[] }) {
  const [selectedUserId, setSelectedUserId] = useState(vendedores[0]?.userId ?? "")
  const [conversations,  setConversations]  = useState<Conversation[]>([])
  const [loadingConvs,   setLoadingConvs]   = useState(false)
  const [selectedPhone,  setSelectedPhone]  = useState<string | null>(null)
  const [messages,       setMessages]       = useState<Message[]>([])
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [contactName,    setContactName]    = useState<string | null>(null)
  const [search,         setSearch]         = useState("")
  const [mobileChat,     setMobileChat]     = useState(false)
  const [inputText,      setInputText]      = useState("")
  const [sending,        setSending]        = useState(false)
  const [sendError,      setSendError]      = useState<string | null>(null)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const pollConvRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollMsgRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)

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
    try {
      const res = await fetch(`/api/chat/${userId}/${encodeURIComponent(phone)}`, { cache: "no-store" })
      if (res.ok) {
        const d = await res.json() as { contactName: string | null; messages: Message[] }
        setMessages(d.messages)
        setContactName(d.contactName)
      }
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => {
    setSelectedPhone(null)
    setMessages([])
    setMobileChat(false)
    fetchConversations(selectedUserId)
    clearInterval(pollConvRef.current!)
    pollConvRef.current = setInterval(() => fetchConversations(selectedUserId), 3000)
    return () => clearInterval(pollConvRef.current!)
  }, [selectedUserId, fetchConversations])

  useEffect(() => {
    if (!selectedPhone) return
    setLoadingMsgs(true)
    fetchMessages(selectedUserId, selectedPhone)
    clearInterval(pollMsgRef.current!)
    pollMsgRef.current = setInterval(() => fetchMessages(selectedUserId, selectedPhone), 3000)
    return () => clearInterval(pollMsgRef.current!)
  }, [selectedPhone, selectedUserId, fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const filtered = useMemo(() => {
    if (!search) return conversations
    const q = search.toLowerCase()
    return conversations.filter(
      (c) => c.contactPhone.includes(q) || (c.contactName ?? "").toLowerCase().includes(q)
    )
  }, [conversations, search])

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !selectedPhone || sending) return
    const text = inputText.trim()
    setInputText("")
    setSendError(null)
    setSending(true)
    try {
      const res = await fetch(
        `/api/chat/${selectedUserId}/${encodeURIComponent(selectedPhone)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) }
      )
      if (res.ok) {
        // Refetch real messages from DB — without race conditions
        await fetchMessages(selectedUserId, selectedPhone)
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setSendError(data.error ?? "Erro ao enviar mensagem")
        setInputText(text) // Devolve o texto para o usuário tentar de novo
      }
    } catch {
      setSendError("Sem conexão com o servidor")
      setInputText(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }, [inputText, selectedPhone, selectedUserId, sending, fetchMessages])

  const selectedVendedor = vendedores.find((v) => v.userId === selectedUserId)

  const openConversation = (phone: string) => {
    setSelectedPhone(phone)
    setMobileChat(true)
  }

  const closeConversation = () => {
    setMobileChat(false)
    setSelectedPhone(null)
  }

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-[#0b0f19]">

      {/* ═══════════════════════════════════════════════════════════
          LEFT PANEL — conversation list
      ═══════════════════════════════════════════════════════════ */}
      <aside className={`
        ${mobileChat ? "hidden" : "flex"} md:flex
        w-full md:w-[320px] lg:w-[340px] shrink-0 flex-col
        border-r border-slate-200 dark:border-white/[0.06]
        bg-white dark:bg-[#0d1120]
      `}>

        {/* ── Instance selector ───────────────────────────── */}
        <div className="px-4 pt-4 pb-3.5 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
          {vendedores.length === 1 ? (
            /* Single instance — just show it */
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGrad(vendedores[0]!.userId)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                {initials(vendedores[0]!.nome, vendedores[0]!.userId)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{vendedores[0]!.nome}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{vendedores[0]!.userId}</p>
              </div>
            </div>
          ) : (
            /* Multiple instances — dropdown */
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGrad(selectedUserId)} flex items-center justify-center text-white text-sm font-bold shrink-0 pointer-events-none`}>
                {selectedVendedor ? initials(selectedVendedor.nome, selectedVendedor.userId) : "?"}
              </div>
              <div className="relative flex-1 min-w-0">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full appearance-none bg-transparent text-sm font-semibold text-slate-900 dark:text-white pr-5 focus:outline-none cursor-pointer truncate"
                >
                  {vendedores.map((v) => (
                    <option key={v.userId} value={v.userId}>{v.nome}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                {selectedVendedor && (
                  <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{selectedVendedor.userId}</p>
                )}
              </div>
            </div>
          )}

          {/* Sub-line: count + refresh indicator */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-[11px] text-slate-400 dark:text-slate-600">
              {conversations.length > 0
                ? `${conversations.length} conversa${conversations.length !== 1 ? "s" : ""}`
                : ""}
            </span>
            {loadingConvs && <Spinner sm />}
          </div>
        </div>

        {/* ── Search ──────────────────────────────────────── */}
        <div className="px-4 py-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contato ou número…"
              className="w-full bg-slate-100 dark:bg-white/[0.05] rounded-xl text-[13px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Conversation list ────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-16 px-6 text-center">
              <Spinner />
              <p className="text-xs text-slate-400 dark:text-slate-600">Carregando conversas…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 pt-16 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.05] flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-slate-400 dark:text-slate-600" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                  {conversations.length === 0 ? "Nenhuma conversa" : "Sem resultados"}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-1 leading-relaxed">
                  {conversations.length === 0
                    ? "Mensagens enviadas e recebidas aparecerão aqui automaticamente."
                    : `Nada encontrado para "${search}"`}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((c) => {
              const active = selectedPhone === c.contactPhone
              const grad = avatarGrad(c.contactPhone)
              return (
                <button
                  key={c.contactPhone}
                  onClick={() => openConversation(c.contactPhone)}
                  className={`relative w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-slate-100 dark:border-white/[0.03] last:border-0 ${
                    active
                      ? "bg-violet-50 dark:bg-violet-500/[0.07]"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.025]"
                  }`}
                >
                  {/* Active indicator */}
                  {active && (
                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-violet-500" />
                  )}

                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[13px] font-bold shrink-0`}>
                    {initials(c.contactName, c.contactPhone)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className={`text-[13px] font-semibold truncate ${active ? "text-violet-700 dark:text-violet-300" : "text-slate-900 dark:text-white"}`}>
                        {displayName(c.contactPhone, c.contactName)}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0 tabular-nums">
                        {fmtTime(c.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-start gap-1 mt-0.5">
                      {c.direction === "out" && (
                        <span className="shrink-0 mt-[1px] text-slate-400">
                          <AckIcon n={c.ackStatus} />
                        </span>
                      )}
                      <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-[1.35] line-clamp-2 break-words">
                        {previewBody(c.body, c.mediaType)}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          RIGHT PANEL — chat messages
      ═══════════════════════════════════════════════════════════ */}
      <main className={`
        ${!mobileChat ? "hidden" : "flex"} md:flex
        flex-1 flex-col min-w-0
        bg-[#f0f2f5] dark:bg-[#080c15]
      `}>

        {!selectedPhone ? (
          /* ── Empty state ────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-10 text-center">
            <div className="w-20 h-20 rounded-3xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center shadow-sm">
              <MessageCircle className="w-9 h-9 text-violet-400/70" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
                Selecione uma conversa
              </p>
              <p className="text-sm text-slate-400 dark:text-slate-600 max-w-xs">
                {selectedVendedor
                  ? `Histórico de conversas de ${selectedVendedor.nome}`
                  : "Escolha uma instância para ver as conversas"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Chat header ──────────────────────────── */}
            <header className="flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-[#0d1120] border-b border-slate-200 dark:border-white/[0.06] shrink-0">
              {/* Mobile back */}
              <button
                onClick={closeConversation}
                className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>

              {/* Avatar */}
              <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGrad(selectedPhone)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {initials(contactName, selectedPhone)}
              </div>

              {/* Contact info */}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
                  {displayName(selectedPhone, contactName)}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Phone className="w-3 h-3" />
                    <span className="font-mono">{fmtPhone(selectedPhone)}</span>
                  </span>
                  {selectedVendedor && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700 text-[11px]">·</span>
                      <span className="text-[11px] text-slate-400">via <span className="font-medium">{selectedVendedor.nome}</span></span>
                    </>
                  )}
                </div>
              </div>

              {loadingMsgs && <Spinner sm />}
            </header>

            {/* ── Messages area ────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-4 py-5 overflow-anchor-none">
              {messages.length === 0 && !loadingMsgs ? (
                <div className="flex justify-center pt-12">
                  <span className="text-[12px] text-slate-400 dark:text-slate-600 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] px-4 py-1.5 rounded-full">
                    Nenhuma mensagem registrada
                  </span>
                </div>
              ) : messages.length === 0 && loadingMsgs ? (
                <div className="flex justify-center pt-12">
                  <Spinner />
                </div>
              ) : (
                <>
                  {messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const showDate = !prev || !isSameDay(prev.timestamp, m.timestamp)
                    const { isFirst, isLast } = msgMeta(messages, i)
                    const out = m.direction === "out"

                    // Border-radius: tail (small corner) only on last message of each group
                    const radius = out
                      ? isLast  ? "rounded-2xl rounded-br-[5px]" : "rounded-2xl"
                      : isLast  ? "rounded-2xl rounded-bl-[5px]" : "rounded-2xl"

                    // More space after last message of a group
                    const mb = isLast ? "mb-3" : "mb-[3px]"

                    return (
                      <div key={m.id} className={mb}>
                        {/* Date divider */}
                        {showDate && (
                          <div className="flex items-center justify-center my-5">
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] px-3.5 py-1 rounded-full shadow-sm">
                              {fmtDate(m.timestamp)}
                            </span>
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`flex items-end gap-1.5 ${out ? "justify-end" : "justify-start"}`}>
                          {/* Incoming avatar placeholder (keeps alignment when grouped) */}
                          {!out && (
                            <div className={`w-6 h-6 rounded-full shrink-0 bg-gradient-to-br ${avatarGrad(selectedPhone)} flex items-center justify-center text-white text-[9px] font-bold ${isLast ? "opacity-100" : "opacity-0"}`}>
                              {initials(contactName, selectedPhone).slice(0, 1)}
                            </div>
                          )}

                          <div
                            className={`max-w-[65%] px-3.5 py-2 shadow-sm ${radius} ${
                              out
                                ? "bg-violet-600 text-white"
                                : "bg-white dark:bg-[#1a2035] text-slate-900 dark:text-white border border-slate-100 dark:border-white/[0.06]"
                            }`}
                          >
                            <MediaBadge type={m.mediaType} out={out} />

                            {m.body && (
                              <p className="text-[13.5px] leading-[1.45] whitespace-pre-wrap break-words">
                                {m.body}
                              </p>
                            )}

                            {/* Time + ACK footer */}
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className={`text-[10px] tabular-nums ${out ? "text-violet-200/75" : "text-slate-400 dark:text-slate-500"}`}>
                                {fmtTime(m.timestamp)}
                              </span>
                              {out && (
                                <span className="text-violet-200">
                                  <AckIcon n={m.ackStatus} dim />
                                </span>
                              )}
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

            {/* ── Input bar ────────────────────────────── */}
            <div className="px-4 py-3 bg-white dark:bg-[#0d1120] border-t border-slate-200 dark:border-white/[0.06] shrink-0">
              {sendError && (
                <div className="flex items-center justify-between mb-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                  <span className="text-[12px] text-red-600 dark:text-red-400">{sendError}</span>
                  <button onClick={() => setSendError(null)} className="ml-2 text-red-400 hover:text-red-600 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value)
                    e.target.style.height = "auto"
                    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Digite uma mensagem…"
                  rows={1}
                  className="flex-1 resize-none bg-slate-100 dark:bg-white/[0.06] rounded-2xl text-[13.5px] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500/30 transition-all leading-snug max-h-[140px] overflow-y-auto"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!inputText.trim() || sending}
                  className="w-10 h-10 shrink-0 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  {sending
                    ? <Spinner sm />
                    : <SendHorizonal className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
