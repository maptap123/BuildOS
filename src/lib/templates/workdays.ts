// Work-day math for job templates. Template offsets are counted in work days (default Mon-Fri)
// from the template's start day, so they survive being applied to any calendar date.

export type WorkDays = Record<
  'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday',
  boolean
>

export const DEFAULT_WORK_DAYS: WorkDays = {
  sunday: false, monday: true, tuesday: true, wednesday: true,
  thursday: true, friday: true, saturday: false,
}

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' -> UTC midnight ms (never local time, so DST can't shift a day). */
function toMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function normalize(wd?: Partial<WorkDays> | null): WorkDays {
  const merged = { ...DEFAULT_WORK_DAYS, ...(wd ?? {}) }
  // A template with no work days at all would loop forever; fall back to the default week.
  return DAY_KEYS.some(k => merged[k]) ? merged : DEFAULT_WORK_DAYS
}

export function isWorkday(iso: string, wd?: Partial<WorkDays> | null): boolean {
  return normalize(wd)[DAY_KEYS[new Date(toMs(iso)).getUTCDay()]]
}

/** First work day on or after `iso`. */
export function snapToWorkday(iso: string, wd?: Partial<WorkDays> | null): string {
  let ms = toMs(iso)
  while (!isWorkday(toIso(ms), wd)) ms += DAY_MS
  return toIso(ms)
}

/** The date `n` work days after day 0 (day 0 = `iso` snapped forward to a work day). */
export function addWorkdays(iso: string, n: number, wd?: Partial<WorkDays> | null): string {
  let ms = toMs(snapToWorkday(iso, wd))
  let left = Math.max(0, Math.trunc(n))
  while (left > 0) {
    ms += DAY_MS
    if (isWorkday(toIso(ms), wd)) left--
  }
  return toIso(ms)
}

/** Work days in [from, to) -- i.e. the offset of `to` from `from`. 0 when to <= from. */
export function workdaysBetween(from: string, to: string, wd?: Partial<WorkDays> | null): number {
  let ms = toMs(from)
  const end = toMs(to)
  let count = 0
  for (; ms < end; ms += DAY_MS) if (isWorkday(toIso(ms), wd)) count++
  return count
}

/** Work days in [start, end] inclusive, at least 1 (a weekend-only span still takes a day). */
export function workdaySpan(start: string, end: string, wd?: Partial<WorkDays> | null): number {
  return Math.max(1, workdaysBetween(start, toIso(toMs(end) + DAY_MS), wd))
}
