"use client"

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

export type RichEditorHandle = {
  insertChip: (raw: string) => void
  insertText: (text: string) => void
  formatSelection: (marker: string) => void
  insertListItem: () => void
  focus: () => void
}

type Props = {
  value: string
  onChange: (val: string) => void
  onSpintaxChipClick?: (raw: string, replace: (newRaw: string) => void) => void
  placeholder?: string
  expanded?: boolean
  onFocus?: () => void
  onBlur?: () => void
}

// ─── Chip factories (imperative DOM — not React) ──────────────────────────────

const VAR_CHIP_CLASS =
  "inline-flex items-center mx-0.5 px-1.5 rounded align-middle bg-violet-100 dark:bg-violet-500/[0.18] text-violet-700 dark:text-violet-300 text-[11px] font-mono font-semibold select-none border border-violet-200 dark:border-violet-500/30"

const SPINTAX_CHIP_CLASS =
  "inline-flex items-center gap-1 mx-0.5 px-1.5 rounded align-middle bg-amber-100 dark:bg-amber-500/[0.18] text-amber-700 dark:text-amber-300 text-[11px] font-medium select-none border border-amber-200 dark:border-amber-500/30 cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"

function makeVarChip(raw: string): HTMLSpanElement {
  const label = raw.slice(1, -1)
  const el = document.createElement("span")
  el.contentEditable = "false"
  el.dataset.chip = "var"
  el.dataset.raw = raw
  el.setAttribute("class", VAR_CHIP_CLASS)
  el.style.verticalAlign = "-0.12em"
  el.style.lineHeight = "1.6"
  // Subtle braces to hint it's a variable
  el.innerHTML = `<span style="opacity:0.45;font-weight:400">{</span>${label}<span style="opacity:0.45;font-weight:400">}</span>`
  return el
}

function makeSpintaxChip(raw: string): HTMLSpanElement {
  const inner = raw.slice(2, -2) // remove {[ and ]}
  const options = inner.split("|")
  const count = options.length
  const preview = options[0]?.trim().slice(0, 22) ?? ""
  const el = document.createElement("span")
  el.contentEditable = "false"
  el.dataset.chip = "spintax"
  el.dataset.raw = raw
  el.setAttribute("class", SPINTAX_CHIP_CLASS)
  el.style.verticalAlign = "-0.12em"
  el.style.lineHeight = "1.6"
  el.title = options.map((o, i) => `${i + 1}. ${o.trim()}`).join("\n")
  const labelText = count === 1
    ? `⚡ ${preview}`
    : `⚡ ${preview}${preview.length >= 22 ? "…" : ""} +${count - 1}`
  el.textContent = labelText
  return el
}

// ─── DOM ↔ string ─────────────────────────────────────────────────────────────

// Spintax must come first so inner {var} references are not matched separately
const TOKEN_RE = /(\{\[[^\]]*\]\}|\{[a-zA-Z_][a-zA-Z0-9_]*\})/g

function serialize(container: HTMLElement): string {
  let out = ""
  for (const node of container.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.dataset.chip) {
        out += el.dataset.raw ?? ""
      } else if (el.tagName === "BR") {
        out += "\n"
      } else if (el.tagName === "DIV" || el.tagName === "P") {
        out += "\n" + serialize(el)
      } else {
        out += serialize(el)
      }
    }
  }
  return out
}

function deserialize(container: HTMLElement, raw: string): void {
  container.innerHTML = ""
  if (!raw) return

  const lines = raw.split("\n")
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) container.appendChild(document.createElement("br"))

    const line = lines[li]!
    let last = 0
    TOKEN_RE.lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m.index > last) {
        container.appendChild(document.createTextNode(line.slice(last, m.index)))
      }
      const token = m[0]!
      container.appendChild(token.startsWith("{[") ? makeSpintaxChip(token) : makeVarChip(token))
      last = m.index + token.length
    }

    if (last < line.length) {
      container.appendChild(document.createTextNode(line.slice(last)))
    }
  }
}

// Insert a chip at the current selection (after focus is on el)
function insertChipAtCursor(chip: HTMLElement, el: HTMLElement): void {
  const sel = window.getSelection()
  const inside = sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)
  if (inside) {
    const range = sel!.getRangeAt(0)
    range.deleteContents()
    range.insertNode(chip)
    range.setStartAfter(chip)
    range.collapse(true)
    sel!.removeAllRanges()
    sel!.addRange(range)
  } else {
    el.appendChild(chip)
    const r = document.createRange()
    r.setStartAfter(chip)
    r.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(r)
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RichScriptEditor = forwardRef<RichEditorHandle, Props>(
  function RichScriptEditor(
    { value, onChange, onSpintaxChipClick, placeholder, expanded, onFocus, onBlur },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const lastRawRef = useRef<string>(value)
    const savedRangeRef = useRef<Range | null>(null)
    const [isEmpty, setIsEmpty] = useState(!value.trim())

    // Track selection inside this editor and save it so insertions work even after blur
    useEffect(() => {
      const onSelectionChange = () => {
        const sel = window.getSelection()
        if (
          sel &&
          sel.rangeCount > 0 &&
          editorRef.current?.contains(sel.getRangeAt(0).startContainer)
        ) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange()
        }
      }
      document.addEventListener("selectionchange", onSelectionChange)
      return () => document.removeEventListener("selectionchange", onSelectionChange)
    }, [])

    // Mount: populate DOM from initial value
    useEffect(() => {
      const el = editorRef.current
      if (!el) return
      deserialize(el, value)
      lastRawRef.current = value
      setIsEmpty(!value.trim())
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync when the value prop changes externally (e.g. switching between steps)
    useEffect(() => {
      if (value === lastRawRef.current) return
      const el = editorRef.current
      if (!el) return
      deserialize(el, value)
      lastRawRef.current = value
      setIsEmpty(!value.trim())
    }, [value])

    const triggerChange = useCallback(() => {
      const el = editorRef.current
      if (!el) return
      const raw = serialize(el)
      lastRawRef.current = raw
      setIsEmpty(!raw.trim())
      onChange(raw)
    }, [onChange])

    const replaceChipNode = useCallback(
      (chipEl: HTMLElement) => (newRaw: string) => {
        const newChip = newRaw.startsWith("{[") ? makeSpintaxChip(newRaw) : makeVarChip(newRaw)
        chipEl.parentNode?.replaceChild(newChip, chipEl)
        triggerChange()
      },
      [triggerChange]
    )

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = (e.target as HTMLElement).closest("[data-chip]") as HTMLElement | null
        if (!target) return
        if (target.dataset.chip === "spintax" && onSpintaxChipClick) {
          onSpintaxChipClick(target.dataset.raw!, replaceChipNode(target))
        }
      },
      [onSpintaxChipClick, replaceChipNode]
    )

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Force Enter to insert a literal \n instead of creating <div>/<br> DOM elements
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          document.execCommand("insertText", false, "\n")
          triggerChange()
          return
        }

        // Backspace on an empty selection: delete the whole preceding chip if present
        if (e.key === "Backspace") {
          const sel = window.getSelection()
          if (!sel || sel.rangeCount === 0) return
          const range = sel.getRangeAt(0)
          if (!range.collapsed) return

          const { startContainer, startOffset } = range
          let prevNode: ChildNode | null = null

          if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
            prevNode = startContainer.previousSibling
          } else if (startContainer === editorRef.current) {
            prevNode = startContainer.childNodes[startOffset - 1] ?? null
          }

          if (prevNode && (prevNode as HTMLElement).dataset?.chip) {
            e.preventDefault()
            prevNode.parentNode?.removeChild(prevNode)
            triggerChange()
          }
        }
      },
      [triggerChange]
    )

    // Paste: strip HTML formatting; convert {var} and {[spintax]} patterns to chips
    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault()
        const text = e.clipboardData.getData("text/plain")
        if (!text) return

        const el = editorRef.current
        if (!el) return

        TOKEN_RE.lastIndex = 0
        let last = 0
        let m: RegExpExecArray | null

        while ((m = TOKEN_RE.exec(text)) !== null) {
          if (m.index > last) {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            document.execCommand("insertText", false, text.slice(last, m.index))
          }
          const token = m[0]!
          const chip = token.startsWith("{[") ? makeSpintaxChip(token) : makeVarChip(token)
          insertChipAtCursor(chip, el)
          last = m.index + token.length
        }

        if (last < text.length) {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          document.execCommand("insertText", false, text.slice(last))
        }

        triggerChange()
      },
      [triggerChange]
    )

    // ── Imperative handle ──────────────────────────────────────────────────────

    // Restore cursor to savedRange when the editor doesn't currently hold the selection
    const restoreCursor = useCallback(() => {
      const el = editorRef.current
      if (!el) return
      const sel = window.getSelection()
      const editorHasFocus =
        sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)
      if (!editorHasFocus && savedRangeRef.current) {
        el.focus()
        const s = window.getSelection()
        s?.removeAllRanges()
        s?.addRange(savedRangeRef.current)
      } else {
        el.focus()
      }
    }, [])

    useImperativeHandle(ref, () => ({
      insertChip(raw: string) {
        const el = editorRef.current
        if (!el) return
        restoreCursor()
        const chip = raw.startsWith("{[") ? makeSpintaxChip(raw) : makeVarChip(raw)
        insertChipAtCursor(chip, el)
        triggerChange()
      },

      insertText(text: string) {
        const el = editorRef.current
        if (!el) return
        restoreCursor()
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand("insertText", false, text)
        triggerChange()
      },

      formatSelection(marker: string) {
        const el = editorRef.current
        if (!el) return
        restoreCursor()
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)

        if (range.collapsed) {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          document.execCommand("insertText", false, marker + marker)
          // Reposition cursor between the two markers
          const s = window.getSelection()
          if (s && s.rangeCount > 0) {
            const r = s.getRangeAt(0)
            const newOffset = r.startOffset - marker.length
            if (r.startContainer.nodeType === Node.TEXT_NODE && newOffset >= 0) {
              r.setStart(r.startContainer, newOffset)
              r.collapse(true)
              s.removeAllRanges()
              s.addRange(r)
            }
          }
        } else {
          const selected = range.toString()
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          document.execCommand("insertText", false, marker + selected + marker)
        }
        triggerChange()
      },

      insertListItem() {
        const el = editorRef.current
        if (!el) return
        restoreCursor()
        const sel = window.getSelection()
        if (!sel || sel.rangeCount === 0) return
        const range = sel.getRangeAt(0)

        const cloned = range.cloneRange()
        cloned.selectNodeContents(el)
        cloned.setEnd(range.startContainer, range.startOffset)
        const before = cloned.toString()
        const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : ""
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand("insertText", false, `${prefix}- `)
        triggerChange()
      },

      focus() {
        editorRef.current?.focus()
      },
    }), [triggerChange, restoreCursor])

    return (
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={triggerChange}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={onFocus}
          onBlur={onBlur}
          style={
            expanded
              ? { minHeight: 240 }
              : { minHeight: 88, maxHeight: 130, overflowY: "auto" as const }
          }
          className="w-full text-sm text-slate-900 dark:text-white focus:outline-none leading-relaxed break-words whitespace-pre-wrap"
        />
        {isEmpty && placeholder && (
          <div
            className="absolute inset-0 pointer-events-none text-sm text-slate-400 dark:text-slate-700 leading-relaxed select-none overflow-hidden"
            aria-hidden
          >
            {placeholder}
          </div>
        )}
      </div>
    )
  }
)
