"use client"

import { useCallback, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Upload, FileText, CheckCircle2, Loader2, ChevronDown, Check, ShieldCheck, Plus, ListPlus, AlertTriangle, Download } from "lucide-react"
import Papa from "papaparse"
import * as XLSX from "xlsx"

type Step = "upload" | "mapping" | "importing" | "done"

type DuplicateDetail = {
  phone: string
  name: string | null
  vendors: string[]
  createdAt: string
  lastContact: string | null
}

function fmtPhone(phone: string): string {
  if (phone.startsWith("55") && phone.length === 13)
    return `+55 (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`
  if (phone.startsWith("55") && phone.length === 12)
    return `+55 (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`
  return phone
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

type ContactList = { id: string; name: string; vendedorId?: string | null }
type Vendedor = { id: string; nome: string }

type Props = {
  lists: ContactList[]
  vendedores?: Vendedor[]
  onClose: () => void
  onSuccess: () => void
  onListCreated?: (list: { id: string; name: string; vendedorId?: string | null }) => void
}

type ParsedData = {
  headers: string[]
  rows: Record<string, string>[]
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-2.5 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
      >
        {placeholder && (
          <option value="" className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400">
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2.5 text-xs px-3 py-2.5 rounded-xl border transition-all text-left w-full ${
        checked
          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          : "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/15 hover:text-slate-700 dark:hover:text-slate-300"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
          checked ? "bg-emerald-500 border-emerald-500" : "border-slate-300 dark:border-white/20"
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      {children}
    </button>
  )
}

export function ImportCSVModal({ lists, vendedores = [], onClose, onSuccess, onListCreated }: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [fileName, setFileName] = useState("")
  const [phoneCol, setPhoneCol] = useState("")
  const [nameCol, setNameCol] = useState("")
  const [listId, setListId] = useState("")
  const [skipDupVendor, setSkipDupVendor] = useState(true)
  const [skipDupGlobal, setSkipDupGlobal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<{
    imported: number
    skipped: number
    duplicates: number
    duplicateDetails: DuplicateDetail[]
    duplicateDetailsTruncated: boolean
  } | null>(null)
  const [showReport, setShowReport] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Local copy of lists so we can append new ones created inline
  const [localLists, setLocalLists] = useState<ContactList[]>(lists)
  // Inline quick-create state
  const [showCreate, setShowCreate] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [newListVendedorId, setNewListVendedorId] = useState("")
  const [creatingList, setCreatingList] = useState(false)
  const [createError, setCreateError] = useState("")

  const applyAutoDetect = useCallback((headers: string[]) => {
    const phoneGuess = headers.find((h) =>
      /tele|phone|fone|celular|numero|número|whats/i.test(h)
    )
    const nameGuess = headers.find((h) => /nome|name/i.test(h))
    if (phoneGuess) setPhoneCol(phoneGuess)
    if (nameGuess) setNameCol(nameGuess)
  }, [])

  const parseFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase()
      if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") return
      setFileName(file.name)

      // ── XLSX / XLS ────────────────────────────────────────────────────────
      if (ext === "xlsx" || ext === "xls") {
        file.arrayBuffer().then((buf) => {
          const wb = XLSX.read(buf, { type: "array" })
          const sheetName = wb.SheetNames[0]
          if (!sheetName) return
          const ws = wb.Sheets[sheetName]
          // sheet_to_json converts each row to an object keyed by header
          // raw:false coerces numbers → strings (important for phone numbers)
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
            defval: "",
            raw: false,
          })
          const headers = rows.length > 0 ? Object.keys(rows[0]!) : []
          setParsed({ headers, rows })
          applyAutoDetect(headers)
          setStep("mapping")
        })
        return
      }

      // ── CSV ───────────────────────────────────────────────────────────────
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const headers = res.meta.fields ?? []
          setParsed({ headers, rows: res.data })
          applyAutoDetect(headers)
          setStep("mapping")
        },
      })
    },
    [applyAutoDetect]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) parseFile(file)
    },
    [parseFile]
  )

  const selectedList = localLists.find((l) => l.id === listId)
  const vendedorId = selectedList?.vendedorId

  const handleImport = async () => {
    if (!parsed || !phoneCol) return
    setStep("importing")

    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsed.rows,
          phoneCol,
          nameCol: nameCol || undefined,
          listId: listId || undefined,
          vendedorId: vendedorId || undefined,
          skipDuplicatesVendor: skipDupVendor && !!vendedorId,
          skipDuplicatesGlobal: skipDupGlobal,
        }),
      })
      const data: { imported: number; skipped: number; duplicates: number; duplicateDetails: DuplicateDetail[]; duplicateDetailsTruncated: boolean } = await res.json()
      setResult(data)
      setStep("done")
    } catch {
      setResult({ imported: 0, skipped: parsed.rows.length, duplicates: 0, duplicateDetails: [], duplicateDetailsTruncated: false })
      setStep("done")
    }
  }

  const handleCreateList = async () => {
    if (!newListName.trim()) return
    setCreatingList(true)
    setCreateError("")
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newListName.trim(),
          vendedorId: newListVendedorId || null,
        }),
      })
      const data: { id?: string; name?: string; vendedorId?: string | null; error?: string } = await res.json()
      if (!res.ok) { setCreateError(data.error ?? "Erro ao criar lista"); setCreatingList(false); return }
      const created = { id: data.id!, name: data.name!, vendedorId: data.vendedorId ?? null }
      setLocalLists((prev) => [created, ...prev])
      setListId(created.id)
      setShowCreate(false)
      setNewListName("")
      setNewListVendedorId("")
      onListCreated?.(created)
    } catch {
      setCreateError("Erro de conexão.")
    } finally {
      setCreatingList(false)
    }
  }

  const colOptions = (parsed?.headers ?? []).map((h) => ({ label: h, value: h }))
  const listOptions = localLists.map((l) => ({ label: l.name, value: l.id }))
  const preview = parsed?.rows.slice(0, 4) ?? []

  return (
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={step === "importing" ? undefined : onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
      />

      <motion.div
        key="modal"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header — fixo no topo */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-600/20 flex items-center justify-center">
                <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">Importar Contatos</p>
            </div>
            {step !== "importing" && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Body — scrollável */}
          <div className="p-6 overflow-y-auto flex-1">
            <AnimatePresence mode="wait">
              {/* STEP: Upload */}
              {step === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  className="space-y-4"
                >
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                      isDragging
                        ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/5"
                        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-600/10 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Arraste seu arquivo aqui
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        CSV, XLSX ou XLS · clique ou arraste · máx 50k linhas
                      </p>
                    </div>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) parseFile(f)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-slate-600">
                      Formatos aceitos:{" "}
                      <span className="text-slate-500 font-medium">.csv</span>,{" "}
                      <span className="text-slate-500 font-medium">.xlsx</span>,{" "}
                      <span className="text-slate-500 font-medium">.xls</span>
                      {" "}· 1ª linha = cabeçalho.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const rows = [
                          "telefone,nome,email,saldo,vencimento",
                          "5511999998888,Gabriel de Souza Ferreira,gabriel@email.com,R$ 150.00,10/12",
                          "5521988887777,ANA MARIA OLIVEIRA,ana@email.com,R$ 320.50,15/12",
                          "5531977776666,CARLOS SILVA,carlos@email.com,R$ 89.90,20/12",
                        ].join("\n")
                        const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = "planilha_exemplo_senderwhats.csv"
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-medium text-violet-500 hover:text-violet-400 transition-colors shrink-0"
                    >
                      <Download className="w-3 h-3" />
                      Planilha exemplo
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP: Mapping */}
              {step === "mapping" && parsed && (
                <motion.div
                  key="mapping"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  className="space-y-5"
                >
                  {/* File info */}
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/5">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{fileName}</p>
                      <p className="text-[10px] text-slate-500">
                        {parsed.rows.length.toLocaleString()} contatos · {parsed.headers.length} colunas
                      </p>
                    </div>
                    <button
                      onClick={() => { setParsed(null); setFileName(""); setStep("upload") }}
                      className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      Trocar
                    </button>
                  </div>

                  {/* Mapping fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">
                        Coluna de Telefone <span className="text-rose-400">*</span>
                      </label>
                      <Select
                        value={phoneCol}
                        onChange={setPhoneCol}
                        options={colOptions}
                        placeholder="Selecionar coluna..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400">
                        Coluna de Nome <span className="text-slate-600">(opcional)</span>
                      </label>
                      <Select
                        value={nameCol}
                        onChange={setNameCol}
                        options={colOptions}
                        placeholder="Nenhuma"
                      />
                    </div>
                  </div>

                  {/* List selector + inline quick-create */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-400">
                        Adicionar à Lista <span className="text-slate-600">(opcional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => { setShowCreate((v) => !v); setCreateError("") }}
                        className={`flex items-center gap-1 text-[10px] font-semibold transition-colors px-2 py-1 rounded-lg ${
                          showCreate
                            ? "bg-violet-500/15 text-violet-300"
                            : "text-slate-500 hover:text-violet-400 hover:bg-violet-500/10"
                        }`}
                      >
                        <Plus className="w-3 h-3" />
                        Nova lista
                      </button>
                    </div>

                    {/* Inline quick-create form */}
                    <AnimatePresence>
                      {showCreate && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3 space-y-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <ListPlus className="w-3.5 h-3.5 text-violet-400" />
                              <span className="text-xs font-semibold text-violet-300">Criar nova lista</span>
                            </div>

                            <input
                              value={newListName}
                              onChange={(e) => setNewListName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
                              placeholder="Nome da lista, ex: Clientes VIP"
                              autoFocus
                              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-all"
                            />

                            {vendedores.length > 0 && (
                              <div className="relative">
                                <select
                                  value={newListVendedorId}
                                  onChange={(e) => setNewListVendedorId(e.target.value)}
                                  className="w-full appearance-none bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2 pr-7 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-violet-500/50 transition-all"
                                >
                                  <option value="" className="bg-white dark:bg-slate-900 text-slate-400">
                                    Sem vendedor vinculado
                                  </option>
                                  {vendedores.map((v) => (
                                    <option key={v.id} value={v.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                      {v.nome}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
                              </div>
                            )}

                            {createError && (
                              <p className="text-[10px] text-rose-400">{createError}</p>
                            )}

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setShowCreate(false); setNewListName(""); setCreateError("") }}
                                className="flex-1 py-1.5 rounded-lg border border-slate-300 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleCreateList}
                                disabled={creatingList || !newListName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                {creatingList ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Plus className="w-3 h-3" />
                                )}
                                Criar e selecionar
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Select
                      value={listId}
                      onChange={setListId}
                      options={listOptions}
                      placeholder="Não adicionar a nenhuma lista"
                    />
                  </div>

                  {/* Duplicate filter toggles */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                      <label className="text-xs font-semibold text-slate-400">
                        Filtro de Duplicados
                      </label>
                    </div>
                    <Toggle
                      checked={skipDupVendor}
                      onChange={(v) => { setSkipDupVendor(v); if (v) setSkipDupGlobal(false) }}
                    >
                      <span>
                        Evitar duplicados para este Vendedor{" "}
                        <span className="text-emerald-500/70">(Recomendado)</span>
                        <br />
                        <span className="text-[10px] text-slate-500 font-normal">
                          Ignora números já presentes em alguma lista do vendedor selecionado.
                        </span>
                      </span>
                    </Toggle>
                    <Toggle
                      checked={skipDupGlobal}
                      onChange={(v) => { setSkipDupGlobal(v); if (v) setSkipDupVendor(false) }}
                    >
                      <span>
                        Evitar duplicados globalmente
                        <br />
                        <span className="text-[10px] text-slate-500 font-normal">
                          Ignora números que já existem em qualquer lugar do banco de dados.
                        </span>
                      </span>
                    </Toggle>
                    {skipDupVendor && !vendedorId && (
                      <p className="text-[10px] text-amber-400 pl-1">
                        Selecione uma lista vinculada a um vendedor para ativar o filtro por vendedor.
                      </p>
                    )}
                  </div>

                  {/* Preview table */}
                  {preview.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400">
                        Prévia ({Math.min(4, preview.length)} primeiras linhas)
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                        <table className="text-[11px] w-full">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-transparent">
                              {parsed.headers.map((h) => (
                                <th
                                  key={h}
                                  className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${
                                    h === phoneCol
                                      ? "text-emerald-400"
                                      : h === nameCol
                                      ? "text-violet-400"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {h}
                                  {h === phoneCol && " 📞"}
                                  {h === nameCol && " 👤"}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((row, i) => (
                              <tr key={i} className="border-b border-slate-100 dark:border-white/[0.03] last:border-0">
                                {parsed.headers.map((h) => (
                                  <td
                                    key={h}
                                    className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[120px] truncate"
                                  >
                                    {row[h] ?? "—"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-600">
                        Colunas extras serão salvas como variáveis nos scripts.{" "}
                        <span className="text-violet-400 font-medium">
                          Dica: use{" "}
                          <span className="font-mono">{"{nome}"}</span> (primeiro nome),{" "}
                          <span className="font-mono">{"{nome_completo}"}</span> (title case) ou{" "}
                          <span className="font-mono">{"{nome_bruto}"}</span> (original) — nomes em caixa alta são corrigidos automaticamente.
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-white/10 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-white/20 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={!phoneCol}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Importar {parsed.rows.length.toLocaleString()} contatos
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP: Importing */}
              {step === "importing" && (
                <motion.div
                  key="importing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-5 py-8"
                >
                  <div className="w-14 h-14 rounded-full bg-emerald-600/10 flex items-center justify-center">
                    <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-900 dark:text-white">Importando contatos...</p>
                    <p className="text-sm text-slate-500 mt-1">
                      Isso pode levar alguns segundos para arquivos grandes.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* STEP: Done */}
              {step === "done" && result && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-5 py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </motion.div>

                  <div className="text-center">
                    <p className="font-semibold text-slate-900 dark:text-white">Importação concluída!</p>
                    <p className="text-sm text-slate-500 mt-1">
                      Seu banco de contatos foi atualizado.
                    </p>
                  </div>

                  {/* Stat cards */}
                  <div className={`grid gap-3 w-full ${result.duplicates > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-400">
                        {result.imported.toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">importados</p>
                    </div>
                    {result.duplicates > 0 && (
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-center">
                        <p className="text-2xl font-bold text-amber-400">
                          {result.duplicates.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">duplicados</p>
                      </div>
                    )}
                    <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-4 text-center">
                      <p className="text-2xl font-bold text-slate-500 dark:text-slate-400">
                        {(result.skipped - result.duplicates).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">ignorados</p>
                    </div>
                  </div>

                  {/* Duplicate audit report (expandable) */}
                  {result.duplicates > 0 && result.duplicateDetails.length > 0 && (
                    <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowReport((v) => !v)}
                        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-amber-500/[0.06] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-xs font-semibold text-amber-300">
                            Relatório de Contatos Duplicados/Ignorados
                          </span>
                          {result.duplicateDetailsTruncated && (
                            <span className="text-[10px] text-amber-500 font-normal">
                              (mostrando 100 de {result.duplicates.toLocaleString()})
                            </span>
                          )}
                        </div>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-amber-500 transition-transform duration-200 ${showReport ? "rotate-180" : ""}`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {showReport && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="max-h-52 overflow-y-auto border-t border-amber-500/10">
                              <table className="text-[10px] w-full">
                                <thead className="sticky top-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
                                  <tr>
                                    {["Telefone", "Nome", "Vendedor(es)", "Cadastro", "Último Contato"].map((h) => (
                                      <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {result.duplicateDetails.map((d, i) => (
                                    <tr
                                      key={d.phone}
                                      className={`border-t border-slate-100 dark:border-white/[0.03] ${i % 2 === 0 ? "bg-slate-50/50 dark:bg-white/[0.01]" : ""}`}
                                    >
                                      <td className="px-3 py-1.5 text-amber-300/80 font-mono whitespace-nowrap">
                                        {fmtPhone(d.phone)}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap max-w-[100px] truncate">
                                        {d.name ?? <span className="text-slate-600">—</span>}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[100px] truncate">
                                        {d.vendors.length > 0 ? d.vendors.join(", ") : <span className="text-slate-600">—</span>}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                                        {fmtDate(d.createdAt)}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                                        {fmtDate(d.lastContact)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div className="flex gap-3 w-full">
                    {result.duplicates > 0 && (
                      <button
                        onClick={() => { setResult(null); setShowReport(false); setSkipDupVendor(false); setSkipDupGlobal(false); setStep("mapping") }}
                        className="flex-1 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/[0.12] text-sm font-semibold transition-colors"
                      >
                        Reimportar duplicados
                      </button>
                    )}
                    <button
                      onClick={() => { onSuccess(); onClose() }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                    >
                      Concluído
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  )
}
