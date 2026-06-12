"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"

type Step = {
  id: string
  stepType: "text" | "image"
  body: string
  imageUrl: string | null
  delayAfterSeconds: number
}

type Props = {
  steps: Step[]
}

const PREVIEW_VARS: Record<string, string> = {
  nome: "Gabriel",
  telefone: "5511999999999",
  saldo: "R$ 1.250,00",
  vencimento: "15/12",
  produto: "Plano Premium",
  email: "gabriel@email.com",
  cidade: "São Paulo",
  empresa: "Acme Ltda",
}

function processSpintax(text: string): string {
  return text.replace(/\{\[([^\]]+)\]\}/g, (_, options: string) => {
    const parts = options.split("|").map((p) => p.trim())
    return parts[Math.floor(Math.random() * parts.length)] ?? parts[0] ?? ""
  })
}

function applyPreview(text: string): string {
  const withSpintax = processSpintax(text)
  return withSpintax.replace(/\{(\w+)\}/g, (match, key: string) => PREVIEW_VARS[key] ?? match)
}

function formatDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}min ${s}s` : `${m} min`
}

function now(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

// Render message body preserving newlines
function MessageText({ text }: { text: string }) {
  if (!text) {
    return <span className="italic opacity-30">Escreva a mensagem...</span>
  }
  return (
    <>
      {text.split("\n").map((line, i, arr) => (
        <span key={i}>
          {line}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

export function PhoneMockup({ steps }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [steps.length])

  const activeSteps = steps.filter((s) => s.body.trim() || steps.indexOf(s) === 0)
  const time = now()

  return (
    <div className="flex justify-center">
      {/* Phone outer shell */}
      <div
        className="relative"
        style={{ width: 270, filter: "drop-shadow(0 32px 64px rgba(0,0,0,0.7))" }}
      >
        {/* Frame */}
        <div
          className="relative rounded-[3.5rem] bg-slate-900 border-[10px] border-slate-700 overflow-hidden"
          style={{ height: 580 }}
        >
          {/* Volume buttons (left) */}
          <div className="absolute -left-[14px] top-24 w-[4px] h-8 rounded-l-full bg-slate-600" />
          <div className="absolute -left-[14px] top-36 w-[4px] h-12 rounded-l-full bg-slate-600" />
          <div className="absolute -left-[14px] top-52 w-[4px] h-12 rounded-l-full bg-slate-600" />
          {/* Power button (right) */}
          <div className="absolute -right-[14px] top-32 w-[4px] h-14 rounded-r-full bg-slate-600" />

          {/* Screen content */}
          <div className="h-full flex flex-col bg-[#0b141a]">
            {/* Status bar */}
            <div
              className="relative flex items-center justify-between px-5 shrink-0"
              style={{ paddingTop: 14, paddingBottom: 4, height: 34 }}
            >
              {/* Dynamic island / notch */}
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 bg-black rounded-full"
                style={{ width: 80, height: 20 }}
              />
              <span className="text-[9px] text-white font-semibold relative z-10">9:41</span>
              <div className="flex items-center gap-1 relative z-10">
                <svg width="12" height="9" viewBox="0 0 12 9" fill="white" opacity={0.9}>
                  <rect x="0" y="4" width="2" height="5" rx="0.5" />
                  <rect x="3" y="3" width="2" height="6" rx="0.5" />
                  <rect x="6" y="1" width="2" height="8" rx="0.5" />
                  <rect x="9" y="0" width="2" height="9" rx="0.5" />
                </svg>
                <svg width="12" height="9" viewBox="0 0 24 18" fill="none" stroke="white" strokeWidth="2" opacity={0.9}>
                  <path d="M1 1s5.33-5 11-5 11 5 11 5" opacity={0.3} />
                  <path d="M5 6s3.33-3 7-3 7 3 7 3" opacity={0.6} />
                  <path d="M9 11s1.67-1 3-1 3 1 3 1" />
                  <circle cx="12" cy="16" r="2" fill="white" />
                </svg>
                <div className="flex items-center gap-0.5">
                  <div className="w-5 h-2.5 rounded-[2px] border border-white/60 flex items-center p-0.5">
                    <div className="w-3 h-full bg-green-400 rounded-[1px]" />
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp header */}
            <div className="bg-[#1f2c34] px-3 py-2 flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                SW
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[11px] font-semibold leading-tight">SenderWhats</p>
                <p className="text-[9px] text-[#25d366] leading-tight">online</p>
              </div>
              <div className="flex items-center gap-3 text-white/60">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.72 9.04 19.79 19.79 0 0 1 1.61 .42a2 2 0 0 1 1.99-2.18h3a2 2 0 0 1 2 1.72" />
                </svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            </div>

            {/* Chat background */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 scrollbar-none"
              style={{
                background:
                  "radial-gradient(circle at 20% 80%, rgba(30,40,50,0.8) 0%, transparent 60%), #0b141a",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.012'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            >
              {/* Date chip */}
              <div className="flex justify-center mb-2">
                <span className="text-[9px] text-white/40 bg-black/30 rounded-full px-2.5 py-0.5">
                  Hoje
                </span>
              </div>

              <AnimatePresence>
                {steps.map((step, index) => {
                  const processed = applyPreview(step.body)
                  const isEmpty = !step.body.trim()
                  const isLast = index === steps.length - 1

                  return (
                    <motion.div
                      key={step.id}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Message bubble */}
                      <div className="flex justify-end">
                        <div
                          className={`relative max-w-[82%] rounded-xl rounded-tr-sm px-2.5 py-1.5 ${
                            isEmpty ? "bg-[#005c4b]/40" : "bg-[#005c4b]"
                          }`}
                          style={{ boxShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
                        >
                          {/* Tail */}
                          <div
                            className="absolute -right-[6px] top-0 w-0 h-0"
                            style={{
                              borderTop: "8px solid #005c4b",
                              borderRight: "6px solid transparent",
                              opacity: isEmpty ? 0.4 : 1,
                            }}
                          />
                          {step.stepType === "image" ? (
                            <div>
                              {step.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={step.imageUrl}
                                  alt="imagem"
                                  className="w-full rounded-lg max-h-36 object-cover mb-1"
                                />
                              ) : (
                                <div className="w-full h-24 rounded-lg bg-white/10 flex items-center justify-center mb-1">
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <polyline points="21 15 16 10 5 21"/>
                                  </svg>
                                </div>
                              )}
                              {step.body.trim() && (
                                <p className="text-[10px] text-white/90 leading-relaxed whitespace-pre-wrap break-words">
                                  <MessageText text={applyPreview(step.body)} />
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-white/90 leading-relaxed whitespace-pre-wrap break-words">
                              <MessageText text={processed} />
                            </p>
                          )}
                          <div className="flex items-center justify-end gap-0.5 mt-0.5">
                            <span className="text-[8px] text-white/40">{time}</span>
                            <Check
                              className="w-2.5 h-2.5 text-[#53bdeb]"
                              style={{ strokeWidth: 2.5 }}
                            />
                            <Check
                              className="w-2.5 h-2.5 text-[#53bdeb] -ml-1.5"
                              style={{ strokeWidth: 2.5 }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Delay indicator between steps */}
                      {!isLast && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex justify-center my-1.5"
                        >
                          <span className="text-[8px] text-white/25 bg-white/5 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                            <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                            </svg>
                            {formatDelay(step.delayAfterSeconds)} até o próximo passo
                          </span>
                        </motion.div>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* Input bar (decorative) */}
            <div className="bg-[#1f2c34] px-2 py-2 flex items-center gap-2 shrink-0">
              <div className="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5 flex items-center">
                <span className="text-[9px] text-white/20">Mensagem</span>
              </div>
              <div className="w-7 h-7 rounded-full bg-[#00a884] flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <path d="M12 15c-1.654 0-3-1.346-3-3V6c0-1.654 1.346-3 3-3s3 1.346 3 3v6c0 1.654-1.346 3-3 3z"/>
                  <path d="M11 19.931V22h2v-2.069c-3.939-.495-7-3.858-7-7.931h2c0 3.309 2.691 6 6 6s6-2.691 6-6h2c0 4.072-3.061 7.436-7 7.931z"/>
                </svg>
              </div>
            </div>

            {/* Home indicator */}
            <div className="bg-[#1f2c34] pb-1.5 flex justify-center shrink-0">
              <div className="w-20 h-1 rounded-full bg-white/20" />
            </div>
          </div>
        </div>

        {/* Reflection overlay */}
        <div
          className="absolute inset-0 rounded-[3.5rem] pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)",
          }}
        />
      </div>
    </div>
  )
}
