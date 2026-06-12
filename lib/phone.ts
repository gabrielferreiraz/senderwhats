/**
 * Normalizes a raw Brazilian phone string to the format 55DDNNNNNNNNN.
 * Handles:
 *  - Country code (55) stripping and re-adding
 *  - Leading zeros
 *  - Missing area code (DDD) → defaults to 11
 *  - Missing 9th digit on mobile numbers (DDD + 8 local digits starting with 6–9)
 */
export function normalizePhone(raw: string): string {
  let clean = raw.replace(/\D/g, "")

  // Remove leading zeros (ex: 011... → 11...)
  clean = clean.replace(/^0+/, "")

  if (clean.length < 8) return clean

  // Strip country code temporarily if present
  if (clean.startsWith("55") && clean.length >= 12) {
    clean = clean.slice(2)
  }

  // No DDD (8 or 9 raw digits) — assume DDD 11
  if (clean.length === 8 || clean.length === 9) {
    if (clean.length === 8) {
      const firstDigit = clean[0]
      // Mobile number missing 9th digit → add it
      if (firstDigit && ["6", "7", "8", "9"].includes(firstDigit)) {
        clean = "9" + clean
      }
    }
    clean = "11" + clean
  }

  // DDD present but 9th digit missing (DDD 2 + local 8 = 10 digits)
  if (clean.length === 10) {
    const ddd = clean.slice(0, 2)
    const local = clean.slice(2)
    const firstDigit = local[0]
    if (firstDigit && ["6", "7", "8", "9"].includes(firstDigit)) {
      clean = ddd + "9" + local
    }
  }

  return "55" + clean
}

/**
 * Splits a multi-number text (comma / semicolon / newline / space separated)
 * and returns deduplicated normalized phone strings.
 * Entries that are too short after normalization (<= 11 chars) are dropped.
 */
export function parsePhones(text: string | string[]): string[] {
  const raw = Array.isArray(text) ? text.join("\n") : String(text ?? "")
  const seen = new Set<string>()
  const result: string[] = []

  for (const token of raw.split(/[,;\n\r\s]+/)) {
    const digits = token.replace(/\D/g, "")
    if (!digits || digits.length < 8) continue
    const phone = normalizePhone(token)
    // A valid normalized Brazilian number is at least 12 chars (55 + DDD 2 + local 8)
    if (phone.length < 12) continue
    if (!seen.has(phone)) {
      seen.add(phone)
      result.push(phone)
    }
  }

  return result
}
