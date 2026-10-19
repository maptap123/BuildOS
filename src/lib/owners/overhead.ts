/**
 * Jobs that are company overhead, not client work — the Shop is always open and crew
 * clock into it, but it has no estimate, no client and no margin. Owners View leaves them
 * out of the job tiles and the totals. People clocked in there still show in the live crew
 * panel, because who is on the clock is still worth seeing.
 *
 * Shared by server (data loader) and client (live crew links), so no server imports here.
 */
const OVERHEAD_JOB_NAMES = new Set(['shop'])

export function isOverheadJob(name: string | null | undefined): boolean {
  return OVERHEAD_JOB_NAMES.has((name ?? '').trim().toLowerCase())
}
