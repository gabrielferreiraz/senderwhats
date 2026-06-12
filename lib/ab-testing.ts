export type AbTemplate = { id: string; weight: number }

/**
 * Distributes `count` slots among `templates` proportionally by weight,
 * then shuffles for random interleaving. Returns one templateId per slot.
 *
 * Uses the largest-remainder (Hamilton) method to eliminate the systematic
 * bias that Math.round introduces (which consistently over-allocates to
 * whichever template rounds up first and under-allocates to the last).
 */
export function assignTemplateIds(
  count: number,
  templates: AbTemplate[]
): Array<string | null> {
  if (count === 0 || templates.length === 0) return Array<string | null>(count).fill(null)
  if (templates.length === 1) return Array(count).fill(templates[0]!.id)

  const total = templates.reduce((s, t) => s + t.weight, 0)
  if (total === 0) return Array(count).fill(templates[0]!.id)

  // Largest-remainder allocation: floor each quota, then award remaining seats
  // to whichever templates have the largest fractional remainders.
  const exact = templates.map((t) => (t.weight / total) * count)
  const floors = exact.map(Math.floor)
  const remaining = count - floors.reduce((a, b) => a + b, 0)

  // Rank templates by descending fractional remainder; award 1 extra each
  const ranked = exact
    .map((v, i) => ({ idx: i, rem: v - floors[i]! }))
    .sort((a, b) => b.rem - a.rem || a.idx - b.idx) // stable tie-break by index

  const extras = new Set(ranked.slice(0, remaining).map((r) => r.idx))

  const slots: string[] = []
  templates.forEach((t, i) => {
    const n = floors[i]! + (extras.has(i) ? 1 : 0)
    for (let j = 0; j < n; j++) slots.push(t.id)
  })

  // Fisher-Yates shuffle for random interleaving between templates
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j]!, slots[i]!]
  }

  return slots
}
