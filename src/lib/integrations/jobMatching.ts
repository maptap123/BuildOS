// Job-to-external-system matching utilities.
// Scores candidate external records against a BuildOS job.
// Scores: >= 0.90 auto-link, 0.70-0.89 store as candidate, < 0.70 ignore.

export interface JobMatchInput {
  id: string
  job_number: string
  name: string
  client_name: string | null
}

export interface ExternalMatchCandidate {
  provider: 'quickbooks' | 'sharepoint' | 'onedrive' | 'buildertrend'
  external_id: string
  external_parent_id?: string
  display_name: string
  external_url?: string
  external_path?: string
  link_type: 'job' | 'customer' | 'folder' | 'file' | 'invoice' | 'estimate' | 'other'
  raw_metadata?: Record<string, unknown>
}

export function normalizeJobName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false
  const words = haystack.split(/\s+/)
  return words.includes(needle)
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(/\s+/).filter(t => t.length > 2))
  const bTokens = new Set(b.split(/\s+/).filter(t => t.length > 2))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let overlap = 0
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++
  }
  return overlap / Math.min(aTokens.size, bTokens.size)
}

/**
 * Score a QuickBooks customer candidate against a BuildOS job.
 *
 * Known fixture (Epure): job.name="Epure", job.client_name="Mark Epure"
 * QB parent "Epure, Mark and Phyllis" → normalizes to "epure mark and phyllis"
 * QB job    "Mark and Phyllis Epure"  → normalizes to "mark and phyllis epure"
 * Both contain "epure" as a whole word → score 0.90
 */
export function scoreQuickBooksCandidate(
  job: JobMatchInput,
  candidate: ExternalMatchCandidate
): number {
  const normJobName    = normalizeJobName(job.name)
  const normClientName = job.client_name ? normalizeJobName(job.client_name) : ''
  const normCandidate  = normalizeJobName(candidate.display_name)
  const rawJson        = JSON.stringify(candidate.raw_metadata ?? {})

  // Job number in display name or raw_metadata
  if (job.job_number && (candidate.display_name.includes(job.job_number) || rawJson.includes(job.job_number))) {
    return 0.98
  }

  // Exact normalized job name
  if (normCandidate === normJobName) return 0.95

  // Exact normalized client name
  if (normClientName && normCandidate === normClientName) return 0.92

  // Job name is a standalone word in the QB customer name
  if (normJobName.length > 1 && containsWholeWord(normCandidate, normJobName)) return 0.90

  // Client last name as standalone word
  if (normClientName) {
    const parts    = normClientName.split(/\s+/)
    const lastName = parts[parts.length - 1]
    if (lastName.length > 2 && containsWholeWord(normCandidate, lastName)) return 0.85
  }

  // Token overlap
  const jobOverlap    = tokenOverlap(normJobName, normCandidate)
  if (jobOverlap >= 0.8) return 0.82
  if (jobOverlap >= 0.5) return 0.75

  const clientOverlap = normClientName ? tokenOverlap(normClientName, normCandidate) : 0
  if (clientOverlap >= 0.8) return 0.80
  if (clientOverlap >= 0.5) return 0.73

  return 0.30
}

/**
 * Score a SharePoint folder candidate against a BuildOS job.
 *
 * Known fixture (Epure): folder name "Epure", path "JDC/Jobs/2025/Epure"
 * normalizeJobName("Epure") === normalizeJobName("Epure") → score 0.95
 */
export function scoreSharePointCandidate(
  job: JobMatchInput,
  candidate: ExternalMatchCandidate
): number {
  const normJobName    = normalizeJobName(job.name)
  const normClientName = job.client_name ? normalizeJobName(job.client_name) : ''
  const normFolder     = normalizeJobName(candidate.display_name)
  const normPath       = candidate.external_path ? normalizeJobName(candidate.external_path) : ''

  // Job number in path or display name
  if (
    job.job_number &&
    (candidate.display_name.includes(job.job_number) ||
      (candidate.external_path ?? '').includes(job.job_number))
  ) {
    return 0.98
  }

  // Exact folder name matches job name
  if (normFolder === normJobName) return 0.95

  // Exact folder name matches client name
  if (normClientName && normFolder === normClientName) return 0.92

  // Job name is a whole word in folder name
  if (normJobName.length > 1 && containsWholeWord(normFolder, normJobName)) return 0.91

  // Job name appears anywhere in folder path
  if (normJobName.length > 1 && normPath.includes(normJobName)) return 0.88

  // Token overlap with folder name
  const jobOverlap = tokenOverlap(normJobName, normFolder)
  if (jobOverlap >= 0.8) return 0.82
  if (jobOverlap >= 0.5) return 0.75

  const clientOverlap = normClientName ? tokenOverlap(normClientName, normFolder) : 0
  if (clientOverlap >= 0.8) return 0.80
  if (clientOverlap >= 0.5) return 0.73

  return 0.30
}
