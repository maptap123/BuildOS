/**
 * Matching a cost code across the two places JDC keeps them
 * =========================================================
 * The cost book writes a trailing dot — `02.4000.`, `14.3000.` — and the imported
 * workbooks do not: `02.4000`, `14.3040`. Compared literally, only 4 of 56 estimate lines
 * find their cost book entry; trimming the dot finds 39. So a line would report that its
 * code "isn't in the cost book" while sitting right next to it, and Fixer would miss the
 * cost book price for a code it had cited correctly.
 *
 * Everything that looks a code up goes through here.
 */

/** The comparable form of a cost code: case-folded, trimmed, no trailing dots. */
export function normalizeCostCode(code: string | null | undefined): string {
  return (code ?? '').trim().toLowerCase().replace(/\.+$/, '')
}

/**
 * Both spellings of a code, for an `in` filter that has to match either table's
 * convention. Deduplicated, since a code may already carry the dot.
 */
export function costCodeVariants(codes: string[]): string[] {
  const out = new Set<string>()
  for (const raw of codes) {
    const code = (raw ?? '').trim()
    if (!code) continue
    const bare = code.replace(/\.+$/, '')
    out.add(code)
    out.add(bare)
    out.add(`${bare}.`)
  }
  return [...out]
}
