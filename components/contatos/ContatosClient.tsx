"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users,
  Upload,
  Search,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  List,
  Phone,
  Tag,
  Database,
  ChevronDown,
  CheckCheck,
  Download,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  ListPlus,
  ListMinus,
} from "lucide-react"
import { ImportCSVModal } from "./ImportCSVModal"
import { NewListModal } from "./NewListModal"
import { DeleteListModal } from "./DeleteListModal"
import { ContactDrawer } from "./ContactDrawer"

type ContactList = {
  id: string
  name: string
  description: string | null
  vendedorId: string | null
  _count: { items: number }
  vendedor: { nome: string; userId: string } | null
}

type Contact = {
  id: string
  phone: string
  name: string | null
  tags: string[]
  variables: Record<string, string> | null
  createdAt: string
  _count: { listItems: number }
  listItems: { list: { id: string; name: string } }[]
  journey: string
}

type Vendedor = { id: string; nome: string }

type Props = {
  initialLists: ContactList[]
  vendedores: Vendedor[]
}

// ─── Journey config ────────────────────────────────────────────────────────────
// Used for both badges on contact rows and for active-filter chip labels.
// "rmkt" is the filter-only key (not a journey value returned by API).

const JOURNEY_MAP: Record<string, { label: string; cls: string }> = {
  sem_envio:      { label: "Sem envio",      cls: "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500" },
  aguardando:     { label: "Aguardando",     cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  enviado:        { label: "Enviado",        cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400" },
  falhou:         { label: "Falhou",         cls: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" },
  respondeu:      { label: "Respondeu",      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  rmkt_concluido: { label: "Rmkt concluído", cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400" },
  // Filter-only key (not returned by the API, only used in filter dropdown + active chip)
  rmkt:           { label: "Em Remarketing", cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400" },
}

const RMKT_STEP_RE = /^rmkt_(\d+)$/

function JourneyBadge({ journey }: { journey: string }) {
  // Dynamic step badge: rmkt_1, rmkt_2, ...
  const stepMatch = RMKT_STEP_RE.exec(journey)
  if (stepMatch) {
    return (
      <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
        Rmkt {stepMatch[1]}
      </span>
    )
  }
  const cfg = JOURNEY_MAP[journey]
  if (!cfg) return null
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortHeader({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  col: string
  label: string
  sortBy: string
  sortDir: string
  onSort: (col: string) => void
}) {
  const active = sortBy === col
  return (
    <button
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
        active
          ? "text-violet-500 dark:text-violet-400"
          : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400"
      }`}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp className="w-2.5 h-2.5" />
        ) : (
          <ArrowDown className="w-2.5 h-2.5" />
        )
      ) : (
        <ChevronsUpDown className="w-2.5 h-2.5 opacity-40" />
      )}
    </button>
  )
}

// ─── Filter select ─────────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  placeholder,
  disabled,
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 pl-3 pr-7 py-2 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ─── Popover helpers ───────────────────────────────────────────────────────────

function VariablesPopover({ vars }: { vars: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const entries = Object.entries(vars).slice(0, 8)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] font-medium text-violet-400 hover:text-violet-300 transition-colors"
      >
        <Database className="w-3 h-3" />
        {Object.keys(vars).length} var{Object.keys(vars).length !== 1 ? "s" : ""}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 z-20 w-52 rounded-xl bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-white/[0.06] shadow-xl p-3 space-y-1.5"
          >
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-violet-600 dark:text-violet-400 font-mono truncate">{`{${k}}`}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[90px]">{v}</span>
              </div>
            ))}
            {Object.keys(vars).length > 8 && (
              <p className="text-[9px] text-slate-400 dark:text-slate-600 pt-1">
                +{Object.keys(vars).length - 8} mais...
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ListsCell({ items }: { items: { list: { id: string; name: string } }[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>

  const first = items[0].list
  const rest = items.slice(1)

  if (rest.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-400 max-w-[120px] truncate">
        <Tag className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate">{first.name}</span>
      </span>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-600/25 transition-colors"
      >
        <Tag className="w-2.5 h-2.5 shrink-0" />
        <span className="truncate max-w-[72px]">{first.name}</span>
        <span className="bg-violet-200 dark:bg-violet-500/30 rounded px-1 ml-0.5">+{rest.length}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 z-20 w-48 rounded-xl bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-white/[0.06] shadow-xl p-2 space-y-1"
          >
            {items.map(({ list }) => (
              <div key={list.id} className="flex items-center gap-1.5 px-1 py-0.5">
                <Tag className="w-2.5 h-2.5 text-violet-500 dark:text-violet-400 shrink-0" />
                <span className="text-[10px] text-slate-700 dark:text-slate-300 truncate">{list.name}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ContatosClient({ initialLists, vendedores }: Props) {
  const [lists, setLists] = useState<ContactList[]>(initialLists)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [selectedVendedorId, setSelectedVendedorId] = useState<string>("")
  const [selectedJourney, setSelectedJourney] = useState<string>("")
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loadingContacts, setLoadingContacts] = useState(false)
  const didMountRef = useRef(false)
  // Tracks programmatic page resets (search/filter change) to avoid double-fetch
  const isResettingPageRef = useRef(false)
  const [showImport, setShowImport] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; count: number } | null>(null)
  const [deletingList, setDeletingList] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{ deleted: number; kept: number } | null>(null)
  const [confirmDeleteContactId, setConfirmDeleteContactId] = useState<string | null>(null)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [allPagesSelected, setAllPagesSelected] = useState(false)
  const [loadingAllIds, setLoadingAllIds] = useState(false)
  const [markingAsSent, setMarkingAsSent] = useState(false)
  const [unmarkingAsSent, setUnmarkingAsSent] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkToast, setBulkToast] = useState<{ count: number; op: "mark" | "unmark" | "delete" | "list-add" | "list-remove" } | null>(null)
  const [createdAfter, setCreatedAfter] = useState("")
  const [createdBefore, setCreatedBefore] = useState("")
  const [sortBy, setSortBy] = useState("createdAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [drawerContactId, setDrawerContactId] = useState<string | null>(null)
  const [journeyCounts, setJourneyCounts] = useState<Record<string, number>>({})
  const [bulkListId, setBulkListId] = useState("")
  const [bulkListLoading, setBulkListLoading] = useState(false)

  const fetchContacts = useCallback(
    async (p: number, q: string, listId: string | null, vendedorId: string, journey: string, after: string, before: string, sBy = "createdAt", sDir = "desc") => {
      setLoadingContacts(true)
      try {
        const params = new URLSearchParams({ page: String(p), limit: "20", search: q, sortBy: sBy, sortDir: sDir })
        if (listId) params.set("listId", listId)
        if (vendedorId) params.set("vendedorId", vendedorId)
        if (journey) params.set("journey", journey)
        if (after) params.set("createdAfter", after)
        if (before) params.set("createdBefore", before)
        const res = await fetch(`/api/contacts?${params}`, { cache: "no-store" })
        if (res.ok) {
          const data: { contacts: Contact[]; total: number; totalPages: number } = await res.json()
          setContacts(data.contacts)
          setTotal(data.total)
          setTotalPages(data.totalPages)
        }
      } finally {
        setLoadingContacts(false)
      }
    },
    []
  )

  const fetchLists = useCallback(async () => {
    const res = await fetch("/api/lists", { cache: "no-store" })
    if (res.ok) {
      const data: ContactList[] = await res.json()
      setLists(data)
    }
  }, [])

  const fetchJourneyCounts = useCallback(async (q: string, listId: string | null, vendedorId: string, after: string, before: string) => {
    const params = new URLSearchParams()
    if (q) params.set("search", q)
    if (listId) params.set("listId", listId)
    if (vendedorId) params.set("vendedorId", vendedorId)
    if (after) params.set("createdAfter", after)
    if (before) params.set("createdBefore", before)
    const res = await fetch(`/api/contacts/journey-counts?${params}`, { cache: "no-store" })
    if (res.ok) setJourneyCounts(await res.json() as Record<string, number>)
  }, [])

  // Reset page + fetch when filters/search/sort change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      isResettingPageRef.current = true
      setSelectedContactIds(new Set())
      setAllPagesSelected(false)
      setConfirmBulkDelete(false)
      setPage(1)
      fetchContacts(1, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
      fetchJourneyCounts(search, selectedListId, selectedVendedorId, createdAfter, createdBefore)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir, fetchContacts, fetchJourneyCounts])

  // Fetch when page changes; skip mount + skip programmatic resets (avoids double-fetch)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (isResettingPageRef.current) { isResettingPageRef.current = false; return }
    fetchContacts(page, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
  }, [page, fetchContacts]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirmDelete = async (id: string) => {
    setDeletingList(true)
    try {
      const res = await fetch(`/api/lists/${id}`, { method: "DELETE" })
      const data: { ok?: boolean; stats?: { contactsDeleted: number; contactsKept: number } } = await res.json()
      if (res.ok) {
        setLists((prev) => prev.filter((l) => l.id !== id))
        if (selectedListId === id) setSelectedListId(null)
        const result = {
          deleted: data.stats?.contactsDeleted ?? 0,
          kept: data.stats?.contactsKept ?? 0,
        }
        setDeleteResult(result)
        setTimeout(() => setDeleteResult(null), 4500)
      }
    } finally {
      setDeletingList(false)
      setDeleteTarget(null)
    }
  }

  const handleDeleteContact = async (id: string) => {
    setDeletingContactId(id)
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" })
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id))
        setTotal((prev) => prev - 1)
      }
    } finally {
      setDeletingContactId(null)
      setConfirmDeleteContactId(null)
    }
  }

  const toggleContact = (id: string) => {
    setAllPagesSelected(false)
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedContactIds.size === contacts.length && contacts.length > 0) {
      setSelectedContactIds(new Set())
      setAllPagesSelected(false)
    } else {
      setSelectedContactIds(new Set(contacts.map((c) => c.id)))
      setAllPagesSelected(false)
    }
  }

  const handleSelectAllPages = () => {
    setAllPagesSelected(true)
  }

  const currentFilter = {
    search: search || undefined,
    listId: selectedListId ?? undefined,
    vendedorId: selectedVendedorId || undefined,
    journey: selectedJourney || undefined,
    createdAfter: createdAfter || undefined,
    createdBefore: createdBefore || undefined,
  }

  const runBulkOp = async (op: "mark" | "unmark") => {
    if (!allPagesSelected && selectedContactIds.size === 0) return
    const endpoint = op === "mark" ? "/api/contacts/mark-sent" : "/api/contacts/unmark-sent"
    op === "mark" ? setMarkingAsSent(true) : setUnmarkingAsSent(true)
    try {
      const payload = allPagesSelected
        ? { filter: currentFilter }
        : { contactIds: Array.from(selectedContactIds) }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json() as { updated: number }
        setBulkToast({ count: data.updated, op })
        setTimeout(() => setBulkToast(null), 4500)
        setSelectedContactIds(new Set())
        setAllPagesSelected(false)
        fetchContacts(page, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
      }
    } finally {
      op === "mark" ? setMarkingAsSent(false) : setUnmarkingAsSent(false)
    }
  }

  const runBulkDelete = async () => {
    if (!allPagesSelected && selectedContactIds.size === 0) return
    setBulkDeleting(true)
    try {
      const payload = allPagesSelected
        ? { filter: currentFilter }
        : { contactIds: Array.from(selectedContactIds) }

      const res = await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json() as { deleted: number }
        setBulkToast({ count: data.deleted, op: "delete" })
        setTimeout(() => setBulkToast(null), 4500)
        setSelectedContactIds(new Set())
        setAllPagesSelected(false)
        setConfirmBulkDelete(false)
        fetchContacts(page, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
      }
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(col)
      setSortDir("desc")
    }
  }

  const exportCSV = () => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (selectedListId) params.set("listId", selectedListId)
    if (selectedVendedorId) params.set("vendedorId", selectedVendedorId)
    if (selectedJourney) params.set("journey", selectedJourney)
    if (createdAfter) params.set("createdAfter", createdAfter)
    if (createdBefore) params.set("createdBefore", createdBefore)
    const a = document.createElement("a")
    a.href = `/api/contacts/export?${params}`
    a.download = ""
    a.click()
  }

  const runBulkList = async (action: "add" | "remove") => {
    if (!bulkListId || (!allPagesSelected && selectedContactIds.size === 0)) return
    setBulkListLoading(true)
    try {
      const payload = allPagesSelected
        ? { listId: bulkListId, action, filter: currentFilter }
        : { listId: bulkListId, action, contactIds: Array.from(selectedContactIds) }
      const res = await fetch("/api/contacts/bulk-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json() as { affected: number }
        setBulkToast({ count: data.affected, op: action === "add" ? "list-add" : "list-remove" })
        setTimeout(() => setBulkToast(null), 4500)
        setSelectedContactIds(new Set())
        setAllPagesSelected(false)
        fetchContacts(page, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
      }
    } finally {
      setBulkListLoading(false)
    }
  }

  const activeList = lists.find((l) => l.id === selectedListId)
  const hasFilters = Boolean(selectedListId || selectedVendedorId || selectedJourney || createdAfter || createdBefore)

  return (
    <>
      {/* ── Bulk op toast ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {bulkToast !== null && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium ${
              bulkToast.op === "mark" || bulkToast.op === "list-add"
                ? "bg-emerald-50 dark:bg-[#0a1a12] border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : bulkToast.op === "delete"
                ? "bg-rose-50 dark:bg-[#1a0a0a] border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400"
                : "bg-slate-50 dark:bg-[#111] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"
            }`}
          >
            <CheckCheck className="w-4 h-4 shrink-0" />
            <span>
              <strong>{bulkToast.count}</strong> contato{bulkToast.count !== 1 ? "s" : ""}{" "}
              {bulkToast.op === "mark"
                ? "marcados como já enviado"
                : bulkToast.op === "delete"
                ? "excluídos"
                : bulkToast.op === "list-add"
                ? "adicionados à lista"
                : bulkToast.op === "list-remove"
                ? "removidos da lista"
                : "desmarcados como enviado"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex gap-5 h-[calc(100vh-6rem)]">
        {/* Left panel: Importações */}
        <div className="w-64 shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Importações
            </p>
            <button
              onClick={() => setShowNewList(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-violet-400 transition-colors px-2 py-1 rounded-lg hover:bg-violet-500/10"
              title="Nova lista"
            >
              <Plus className="w-3 h-3" />
              Nova
            </button>
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedListId(null)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left w-full ${
              !selectedListId
                ? "bg-violet-100 dark:bg-violet-600/15 text-violet-700 dark:text-violet-300 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]"
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">Todos os contatos</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{total.toLocaleString("pt-BR")}</span>
          </motion.button>

          {lists.length > 0 && <div className="h-px bg-slate-200 dark:bg-white/[0.04] mx-1 my-0.5" />}

          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5">
            <AnimatePresence>
              {lists.map((list) => (
                <motion.div
                  key={list.id}
                  layout
                  exit={{ opacity: 0, x: -16, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`rounded-xl border transition-all ${
                    selectedListId === list.id
                      ? "bg-violet-50 dark:bg-violet-600/10 border-violet-200 dark:border-violet-500/20"
                      : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.05] hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:hover:border-white/10"
                  }`}
                >
                  <button
                    onClick={() => setSelectedListId(list.id)}
                    className="flex items-center gap-2.5 px-3 pt-2.5 pb-1.5 text-left w-full"
                  >
                    <List
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selectedListId === list.id
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-slate-400 dark:text-slate-500"
                      }`}
                    />
                    <span
                      className={`truncate flex-1 text-sm font-medium ${
                        selectedListId === list.id
                          ? "text-violet-700 dark:text-violet-200"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {list.name}
                    </span>
                    <span
                      className={`text-[10px] shrink-0 font-semibold px-1.5 py-0.5 rounded-full ${
                        selectedListId === list.id
                          ? "bg-violet-200 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                          : "bg-slate-100 dark:bg-white/[0.06] text-slate-500"
                      }`}
                    >
                      {list._count.items.toLocaleString("pt-BR")}
                    </span>
                  </button>

                  <div className="px-3 pb-2.5 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setDeleteTarget({ id: list.id, name: list.name, count: list._count.items })}
                      className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors group/btn"
                    >
                      <Trash2 className="w-3 h-3 group-hover/btn:text-rose-400 transition-colors" />
                      <span className="group-hover/btn:text-rose-400 transition-colors">Desimportar</span>
                    </button>
                    {list.vendedor ? (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[100px]" title={list.vendedor.nome}>
                        {list.vendedor.nome}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 dark:text-slate-700 italic">Sem responsável</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {lists.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center px-3">
              <List className="w-6 h-6 text-slate-300 dark:text-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-600">Nenhuma importação ainda.</p>
              <button
                onClick={() => setShowImport(true)}
                className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/10 text-emerald-700 dark:text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-600/20 transition-colors"
              >
                + Importar agora
              </button>
            </div>
          )}
        </div>

        {/* Right panel: Contacts table */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Row 1: Search + Import */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="w-full bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-violet-500/30 transition-all"
              />
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={exportCSV}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.07] transition-colors whitespace-nowrap"
              title="Exportar contatos filtrados para CSV"
            >
              <Download className="w-4 h-4" />
              Exportar
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              Importar Arquivo
            </motion.button>
          </div>

          {/* Row 2: Journey + Vendedor + Date filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Journey filter */}
            <FilterSelect
              value={selectedJourney}
              onChange={(v) => setSelectedJourney(v)}
              placeholder="Todas as jornadas"
              disabled={loadingContacts}
            >
              {([
                ["sem_envio", "Sem envio"],
                ["aguardando", "Aguardando"],
                ["enviado", "Enviado"],
                ["respondeu", "Respondeu"],
                ["rmkt", "Em Remarketing"],
                ["rmkt_concluido", "Rmkt Concluído"],
                ["falhou", "Falhou"],
              ] as [string, string][]).map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}{journeyCounts[val] != null ? ` (${journeyCounts[val].toLocaleString("pt-BR")})` : ""}
                </option>
              ))}
            </FilterSelect>

            {/* Vendedor filter */}
            {vendedores.length > 0 && (
              <FilterSelect
                value={selectedVendedorId}
                onChange={(v) => setSelectedVendedorId(v)}
                placeholder="Todos os vendedores"
                disabled={loadingContacts}
              >
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </FilterSelect>
            )}

            {/* Date range filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">De</span>
              <input
                type="date"
                value={createdAfter}
                onChange={(e) => setCreatedAfter(e.target.value)}
                disabled={loadingContacts}
                className="appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 px-2.5 py-2 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer disabled:opacity-50 [color-scheme:dark]"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">até</span>
              <input
                type="date"
                value={createdBefore}
                onChange={(e) => setCreatedBefore(e.target.value)}
                disabled={loadingContacts}
                className="appearance-none bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 px-2.5 py-2 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer disabled:opacity-50 [color-scheme:dark]"
              />
              {(createdAfter || createdBefore) && (
                <button
                  onClick={() => { setCreatedAfter(""); setCreatedBefore("") }}
                  className="text-[10px] text-slate-400 hover:text-rose-500 transition-colors"
                  title="Limpar filtro de data"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {hasFilters && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeList && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400">
                    Lista: {activeList.name}
                    <button onClick={() => setSelectedListId(null)} className="ml-0.5 hover:text-rose-500 transition-colors">✕</button>
                  </span>
                )}
                {selectedVendedorId && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400">
                    {vendedores.find((v) => v.id === selectedVendedorId)?.nome}
                    <button onClick={() => setSelectedVendedorId("")} className="ml-0.5 hover:text-rose-500 transition-colors">✕</button>
                  </span>
                )}
                {selectedJourney && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    {JOURNEY_MAP[selectedJourney]?.label ?? selectedJourney}
                    <button onClick={() => setSelectedJourney("")} className="ml-0.5 hover:text-rose-500 transition-colors">✕</button>
                  </span>
                )}
                <button
                  onClick={() => { setSelectedListId(null); setSelectedVendedorId(""); setSelectedJourney(""); setCreatedAfter(""); setCreatedBefore("") }}
                  className="text-[10px] font-medium text-slate-400 hover:text-rose-500 transition-colors px-1"
                >
                  Limpar tudo
                </button>
              </div>
            )}

            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-600 whitespace-nowrap">
              {total.toLocaleString("pt-BR")} contato{total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Bulk action bar */}
          <AnimatePresence>
            {selectedContactIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20"
              >
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 shrink-0">
                  {allPagesSelected
                    ? `Todos os ${total.toLocaleString("pt-BR")} selecionados`
                    : `${selectedContactIds.size} selecionado${selectedContactIds.size !== 1 ? "s" : ""}`}
                </span>

                {/* Select all pages link — only when current page fills the selection */}
                {!allPagesSelected && selectedContactIds.size === contacts.length && total > contacts.length && (
                  <button
                    onClick={handleSelectAllPages}
                    className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 underline underline-offset-2 hover:text-violet-500 transition-colors"
                  >
                    {`Selecionar todos os ${total.toLocaleString("pt-BR")}`}
                  </button>
                )}

                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                  <button
                    onClick={() => runBulkOp("mark")}
                    disabled={markingAsSent || unmarkingAsSent || bulkDeleting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                    title="Marca como já enviado — será pulado em novas campanhas"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    {markingAsSent ? "Marcando..." : "Marcar como enviado"}
                  </button>
                  <button
                    onClick={() => runBulkOp("unmark")}
                    disabled={markingAsSent || unmarkingAsSent || bulkDeleting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
                    title="Remove a marcação manual — contatos voltam a ser elegíveis para campanhas"
                  >
                    <CheckCheck className="w-3.5 h-3.5 opacity-40" />
                    {unmarkingAsSent ? "Desmarcando..." : "Desmarcar"}
                  </button>

                  {/* Bulk delete com confirmação inline */}
                  {confirmBulkDelete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                        Excluir {allPagesSelected ? total.toLocaleString("pt-BR") : selectedContactIds.size} contato{selectedContactIds.size !== 1 ? "s" : ""}?
                      </span>
                      <button
                        onClick={runBulkDelete}
                        disabled={bulkDeleting}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50"
                      >
                        {bulkDeleting ? "Excluindo..." : "Confirmar"}
                      </button>
                      <button
                        onClick={() => setConfirmBulkDelete(false)}
                        disabled={bulkDeleting}
                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors px-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmBulkDelete(true)}
                      disabled={markingAsSent || unmarkingAsSent || bulkDeleting}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir
                    </button>
                  )}

                  <button
                    onClick={() => { setSelectedContactIds(new Set()); setAllPagesSelected(false); setConfirmBulkDelete(false) }}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors px-1"
                  >
                    ✕
                  </button>
                </div>

                {/* Bulk list actions */}
                {lists.length > 0 && (
                  <div className="w-full flex items-center gap-2 pt-2 border-t border-violet-200 dark:border-violet-500/20 flex-wrap">
                    <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider shrink-0">
                      Lista:
                    </span>
                    <div className="relative">
                      <select
                        value={bulkListId}
                        onChange={(e) => setBulkListId(e.target.value)}
                        className="appearance-none bg-white dark:bg-white/[0.06] border border-violet-200 dark:border-violet-500/20 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer"
                      >
                        <option value="">Selecionar lista...</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => runBulkList("add")}
                      disabled={!bulkListId || bulkListLoading}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40"
                    >
                      <ListPlus className="w-3 h-3" />
                      Adicionar
                    </button>
                    <button
                      onClick={() => runBulkList("remove")}
                      disabled={!bulkListId || bulkListLoading}
                      className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/[0.06] border border-violet-200 dark:border-violet-500/20 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-40"
                    >
                      <ListMinus className="w-3 h-3" />
                      Remover
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="flex-1 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden flex flex-col">
            {/* Table header */}
            <div className="grid grid-cols-[24px_2fr_1.5fr_1fr_1fr_auto_40px] gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
              <input
                type="checkbox"
                className="rounded border-slate-300 dark:border-slate-600 w-3.5 h-3.5 accent-violet-600"
                checked={contacts.length > 0 && selectedContactIds.size === contacts.length}
                onChange={toggleAll}
              />
              <SortHeader col="name" label="Contato / Jornada" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader col="phone" label="Telefone" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Variáveis</span>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Listas</span>
              <SortHeader col="createdAt" label="Data" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <span />
            </div>

            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
              {loadingContacts ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <Users className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                  <p className="text-sm text-slate-500">
                    {search
                      ? `Nenhum contato encontrado para "${search}"`
                      : selectedJourney || selectedVendedorId
                      ? "Nenhum contato com esses filtros."
                      : selectedListId
                      ? "Esta lista não tem contatos ainda."
                      : "Nenhum contato importado ainda."}
                  </p>
                  {!search && !selectedListId && !selectedJourney && !selectedVendedorId && (
                    <button
                      onClick={() => setShowImport(true)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-600/20 transition-colors"
                    >
                      + Importar arquivo agora
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${page}-${search}-${selectedListId}-${selectedVendedorId}-${selectedJourney}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <AnimatePresence>
                      {contacts.map((c, i) => (
                        <motion.div
                          key={c.id}
                          layout
                          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.18 }}
                          className={`grid grid-cols-[24px_2fr_1.5fr_1fr_1fr_auto_40px] gap-3 px-5 py-3 items-center text-sm group/row ${
                            i !== contacts.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""
                          } hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors`}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 dark:border-slate-600 w-3.5 h-3.5 accent-violet-600"
                            checked={selectedContactIds.has(c.id)}
                            onChange={() => toggleContact(c.id)}
                          />

                          {/* Name + journey badge */}
                          <button
                            onClick={() => setDrawerContactId(c.id)}
                            className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
                          >
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-600/30 dark:to-indigo-600/30 flex items-center justify-center text-[10px] font-bold text-violet-600 dark:text-violet-300 shrink-0">
                              {(c.name ?? c.phone)?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <div className="min-w-0">
                              <p className="text-slate-900 dark:text-white truncate font-medium text-sm leading-tight">
                                {c.name ?? <span className="text-slate-400 italic">Sem nome</span>}
                              </p>
                              <JourneyBadge journey={c.journey} />
                            </div>
                          </button>

                          {/* Phone */}
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Phone className="w-3 h-3 shrink-0 text-slate-400 dark:text-slate-600" />
                            <span className="font-mono text-xs">{c.phone}</span>
                          </div>

                          {/* Variables */}
                          <div>
                            {c.variables && Object.keys(c.variables).length > 0 ? (
                              <VariablesPopover vars={c.variables as Record<string, string>} />
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>
                            )}
                          </div>

                          {/* Lists */}
                          <div>
                            <ListsCell items={c.listItems} />
                          </div>

                          {/* Date */}
                          <span className="text-[11px] text-slate-400 dark:text-slate-600 whitespace-nowrap">
                            {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                          </span>

                          {/* Delete */}
                          <div className="flex items-center justify-center">
                            <AnimatePresence mode="wait">
                              {confirmDeleteContactId === c.id ? (
                                <motion.div
                                  key="confirm"
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.9 }}
                                  className="flex items-center gap-1"
                                >
                                  <button
                                    onClick={() => setConfirmDeleteContactId(null)}
                                    className="text-[10px] px-1.5 py-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                                  >
                                    ✕
                                  </button>
                                  <button
                                    onClick={() => handleDeleteContact(c.id)}
                                    disabled={deletingContactId === c.id}
                                    className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors disabled:opacity-50"
                                  >
                                    {deletingContactId === c.id ? "..." : "OK"}
                                  </button>
                                </motion.div>
                              ) : (
                                <motion.button
                                  key="trash"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  onClick={() => setConfirmDeleteContactId(c.id)}
                                  className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors opacity-0 group-hover/row:opacity-100"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
                <p className="text-xs text-slate-500">
                  {total.toLocaleString()} contato{total !== 1 ? "s" : ""} · página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = page <= 3 ? i + 1 : page - 2 + i
                    if (pg > totalPages) return null
                    return (
                      <button
                        key={pg}
                        onClick={() => setPage(pg)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          pg === page
                            ? "bg-violet-600 text-white"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]"
                        }`}
                      >
                        {pg}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showImport && (
          <ImportCSVModal
            lists={lists}
            vendedores={vendedores}
            onClose={() => setShowImport(false)}
            onSuccess={() => {
              fetchContacts(1, search, selectedListId, selectedVendedorId, selectedJourney, createdAfter, createdBefore, sortBy, sortDir)
              fetchLists()
            }}
            onListCreated={(newList) =>
              setLists((prev) => [
                { ...newList, vendedorId: newList.vendedorId ?? null, description: null, _count: { items: 0 }, vendedor: null },
                ...prev,
              ])
            }
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNewList && (
          <NewListModal
            vendedores={vendedores}
            onClose={() => setShowNewList(false)}
            onSuccess={(newList) => {
              setLists((prev) => [
                { ...newList, description: null, vendedorId: null, _count: { items: 0 }, vendedor: null },
                ...prev,
              ])
            }}
          />
        )}
      </AnimatePresence>

      <DeleteListModal
        list={deleteTarget}
        onConfirm={handleConfirmDelete}
        onClose={() => { if (!deletingList) setDeleteTarget(null) }}
        deleting={deletingList}
      />

      {/* Contact drawer */}
      <AnimatePresence>
        {drawerContactId && (
          <ContactDrawer
            contactId={drawerContactId}
            onClose={() => setDrawerContactId(null)}
            onNameChange={(id, name) =>
              setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
            }
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteResult && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-white dark:bg-[#0b0f19] border border-slate-200 dark:border-white/[0.06] shadow-xl text-sm text-slate-900 dark:text-white whitespace-nowrap"
          >
            <span className="text-emerald-400 font-bold">✓</span>
            <span>
              Lista excluída.
              {deleteResult.deleted > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-rose-400">{deleteResult.deleted.toLocaleString("pt-BR")}</span>{" "}
                  contato{deleteResult.deleted !== 1 ? "s" : ""} deletado{deleteResult.deleted !== 1 ? "s" : ""}.
                </>
              )}
              {deleteResult.kept > 0 && (
                <>
                  {" "}
                  <span className="font-semibold text-emerald-400">{deleteResult.kept.toLocaleString("pt-BR")}</span>{" "}
                  preservado{deleteResult.kept !== 1 ? "s" : ""}.
                </>
              )}
              {deleteResult.deleted === 0 && deleteResult.kept === 0 && <> Nenhum contato vinculado.</>}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
