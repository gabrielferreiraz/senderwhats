const PT_PREPOSITIONS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o",
])

export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return ""
  const first = fullName.trim().split(/\s+/)[0] ?? ""
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function formatTitleCase(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return ""
  return fullName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && PT_PREPOSITIONS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}
