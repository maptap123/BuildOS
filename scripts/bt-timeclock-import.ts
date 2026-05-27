#!/usr/bin/env tsx
/**
 * BuilderTrend → BuildOS  Time Clock Import
 * ==========================================
 * Pulls every completed shift from the BT Time Clock Grid API and upserts
 * it into the BuildOS Supabase `time_entries` table.  Safe to re-run: the
 * `bt_shift_id` unique index prevents duplicate rows.
 *
 * Usage
 * -----
 *   npx tsx scripts/bt-timeclock-import.ts                          # full import (opens browser for BT login)
 *   npx tsx scripts/bt-timeclock-import.ts --dry-run                # preview, no writes
 *   npx tsx scripts/bt-timeclock-import.ts --from 2026-01-01        # date filter
 *   npx tsx scripts/bt-timeclock-import.ts --from-file scripts/bt-shifts-raw.json   # skip browser, use saved JSON
 *   npx tsx scripts/bt-timeclock-import.ts --from-file scripts/bt-shifts-raw.json --dry-run
 *
 * Getting the raw JSON without a browser
 * ---------------------------------------
 * 1. Open BuilderTrend in Claude Code's Playwright browser (already logged in)
 * 2. Run the fetch script via browser_evaluate with filename: 'scripts/bt-shifts-raw.json'
 * 3. Re-run this script with --from-file scripts/bt-shifts-raw.json
 *
 * Auth (browser mode)
 * -------------------
 * First run: a visible Chromium window opens — log in to BuilderTrend.
 * Session is saved in .bt-session/ and reused on subsequent (headless) runs.
 */

import { chromium, type Page } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'
// ─── Env ──────────────────────────────────────────────────────────────────────
// Load .env.local without a dotenv dependency
const envFile = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf-8').split('\n').forEach(line => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && !(k in process.env)) process.env[k] = v
    }
  })
}

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BT_SESSION_DIR    = path.resolve(__dirname, '../.bt-session')
const MIGRATION_USER_ID = '9f631c7a-3877-4984-9e9b-4ebc18b47fd8' // Migration System
const JDC_TZ            = 'America/New_York'

if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

// ─── BT API URLs ──────────────────────────────────────────────────────────────
const BT_GRID_URL      = 'https://buildertrend.net/api/TimeClock/Grid?gridType=29'
const BT_JOBPICKER_URL = 'https://buildertrend.net/api/jobpicker/GetJobPickerData'
const BT_HOME_URL      = 'https://buildertrend.net/app/TimeClock/Reports'

// BT cost-code titles that map to NULL in BuildOS (their internal billing label)
const BT_FLAT_RATE_CODES = new Set(['Buildertrend Flat Rate', 'Flat Rate'])

// ─── Types ────────────────────────────────────────────────────────────────────
interface BTShift {
  id:             number
  jobId:          number
  userID:         number
  jobName:        string
  name:           string
  timeIn:         { timeStamp: string }
  timeOut:        { timeStamp: string } | null
  breakTime:      { breakTime: number }   // minutes
  regularTime:    number                  // minutes
  overTime:       number                  // minutes
  builderCost:    { value: number }
  rate:           string                  // "$42.00"
  approvalStatus: { isApproved: boolean }
  costCodes:      Array<{ costCodeTitle: string }>
  notes:          string
  tags:           Array<{ name?: string } | string>
}

interface BTGridData {
  data:       BTShift[]
  totalPages: number
  records:    number
  page:       number
  pageSize:   number
}

interface BTGridResponse  { success: boolean; data: BTGridData }
interface BTJobPickerData { jobs: Array<{ jobId: number; jobName: string }> }
interface BTJobPickerResp { success: boolean; data: BTJobPickerData }

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY, {
  auth: { persistSession: false }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "$42.00" → 42  (returns null on failure) */
function parseRate(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

/** BT stores durations in minutes; we store hours */
function minsToHours(m: number): number {
  return parseFloat((m / 60).toFixed(4))
}

/** Map BT cost codes → BuildOS cost_code (null for billing-only codes) */
function mapCostCode(codes: BTShift['costCodes']): string | null {
  if (!codes?.length) return null
  const title = codes[0].costCodeTitle
  return BT_FLAT_RATE_CODES.has(title) ? null : title
}

/**
 * Convert a BT "local" timestamp (no TZ, e.g. "2026-05-20T09:19:00")
 * to a proper ISO-8601 string with the correct Eastern UTC offset.
 * Handles DST automatically via the Intl API.
 */
function btTimestampToISO(localTs: string): string {
  // Step 1: pretend it's UTC to get a Date object for the right calendar day/time
  const asUTC = new Date(localTs + 'Z')

  // Step 2: ask Intl what Eastern time that UTC maps to (to find the DST offset)
  const parts: Record<string, string> = {}
  new Intl.DateTimeFormat('en-US', {
    timeZone: JDC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(asUTC).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value })

  const easternEpochMs = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second
  )

  // Step 3: offset = UTC_as_eastern_epoch - true_UTC
  const offsetHours = Math.round((easternEpochMs - asUTC.getTime()) / 3_600_000)
  const sign  = offsetHours >= 0 ? '+' : '-'
  const hh    = String(Math.abs(offsetHours)).padStart(2, '0')
  return `${localTs}${sign}${hh}:00`
}

// ─── User cache ───────────────────────────────────────────────────────────────
const userByBtId   = new Map<number, string>()   // BT userID  → BuildOS uuid
const userByName   = new Map<string, string>()   // BT name    → BuildOS uuid

async function resolveUser(shift: BTShift): Promise<string | null> {
  if (userByBtId.has(shift.userID)) return userByBtId.get(shift.userID)!
  if (userByName.has(shift.name))   return userByName.get(shift.name)!

  // 1. Check existing BuildOS user by full_name match
  const { data: existing } = await supabase
    .from('users')
    .select('id, full_name')
    .ilike('full_name', shift.name)
    .maybeSingle()

  if (existing) {
    userByBtId.set(shift.userID, existing.id)
    userByName.set(shift.name,   existing.id)
    console.log(`    👤 Mapped "${shift.name}" → existing user ${existing.id}`)
    return existing.id
  }

  // 2. Create new auth + public user
  const email = shift.name.toLowerCase().replace(/\s+/g, '.') + '@jdcremodeling.buildos'
  console.log(`    ✚ Creating user "${shift.name}" (${email})`)

  const { data: au, error: authErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: shift.name },
  })

  if (authErr || !au.user) {
    console.error(`    ✗ Failed to create user "${shift.name}":`, authErr?.message)
    return null
  }

  // Set hourly rate from the shift's rate string
  const rate = parseRate(shift.rate)
  await supabase.from('users').update({
    hourly_rate:   rate,
    overtime_rate: rate ? parseFloat((rate * 1.5).toFixed(2)) : null,
  }).eq('id', au.user.id)

  userByBtId.set(shift.userID, au.user.id)
  userByName.set(shift.name,   au.user.id)
  return au.user.id
}

// ─── Job cache ────────────────────────────────────────────────────────────────
const jobByBtId = new Map<number, string | null>()  // BT jobId → BuildOS uuid

async function resolveJob(btJobId: number, btJobName: string): Promise<string | null> {
  if (jobByBtId.has(btJobId)) return jobByBtId.get(btJobId)!

  // BuildOS job_number stores the BT job ID as a string
  const { data: job } = await supabase
    .from('jobs')
    .select('id, name')
    .eq('job_number', String(btJobId))
    .maybeSingle()

  if (job) {
    console.log(`    🏗  Mapped BT job ${btJobId} → "${job.name}"`)
    jobByBtId.set(btJobId, job.id)
    return job.id
  }

  console.warn(`    ⚠  No BuildOS job for BT job ${btJobId} ("${btJobName}") — skipping`)
  jobByBtId.set(btJobId, null)
  return null
}

// ─── BT API helpers (run inside Playwright page context) ──────────────────────

/** Fetch all BT job IDs visible to this account */
async function fetchBtJobIds(page: Page): Promise<number[]> {
  const resp: BTJobPickerResp = await page.evaluate(
    async ([url]: [string]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'portaltype': '1' },
        body: JSON.stringify({ searchTerm: '', showTemplates: false, showGeneral: true }),
      })
      return r.json()
    },
    [BT_JOBPICKER_URL] as [string]
  )
  if (!resp.success) throw new Error('Failed to fetch BT job list')
  return resp.data.jobs.map(j => j.jobId).filter(id => id > 0)
}

/** Fetch one page of shifts from BT */
async function fetchBtShiftsPage(
  page: Page,
  jobIds: number[],
  pageNumber: number,
  fromDate: string,
  toDate: string,
): Promise<BTGridData> {
  // Use "all time" filter — date filtering done post-fetch if needed.
  // Passing a date-range filter with SelectedValue:0 can return 0 results
  // depending on the BT account's saved view; the "all time" SelectedValue
  // (2147483647) is reliable and works across all accounts.
  const filters = JSON.stringify({
    '12': JSON.stringify({ SelectedValue: 2147483647, StartDate: null, EndDate: null }),
  })

  const PAGE_SIZE = 200
  const body = {
    gridRequest: {
      hideMultiJobsColumns: false,
      selectedColumns: ['1','2','11','3','4','5','40','6','7','9','29','46','24','23','39','10'],
      sortColumn: '1',
      sortDirection: 'asc',
      hasFooter: false,
      emptyStateEntity: 19,
      savedViewId: -1,
    },
    pagingData: {
      pageNumber: String(pageNumber),
      pageSize: PAGE_SIZE,
      resetScroll: false,
      firstRow: (pageNumber - 1) * PAGE_SIZE + 1,
      lastRow: pageNumber * PAGE_SIZE,
      totalRowsAllPages: PAGE_SIZE,
      currentPage: pageNumber,
    },
    filters,
    jobIds,
    includeGeneralJobItems: true,
  }

  const resp: BTGridResponse = await page.evaluate(
    async ([url, b]: [string, object]) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'portaltype': '1' },
        body: JSON.stringify(b),
      })
      return r.json()
    },
    [BT_GRID_URL, body] as [string, object]
  )

  if (!resp.success) throw new Error(`BT Grid API failed on page ${pageNumber}`)
  return resp.data
}

// ─── Core import ──────────────────────────────────────────────────────────────

interface Stats { inserted: number; skipped: number; errors: number }

async function importShift(shift: BTShift, dryRun: boolean, stats: Stats): Promise<void> {
  const label = `${shift.name} @ ${shift.jobName} (${shift.timeIn.timeStamp.slice(0, 10)}, #${shift.id})`

  // Skip open shifts (worker still clocked in)
  if (!shift.timeOut?.timeStamp) {
    console.log(`  ⏩  ${label}  — still open, skipping`)
    stats.skipped++
    return
  }

  const jobId = await resolveJob(shift.jobId, shift.jobName)
  if (!jobId) { stats.skipped++; return }

  const userId = await resolveUser(shift)
  if (!userId) { stats.errors++;  return }

  const hourlyRate  = parseRate(shift.rate)
  const regularHrs  = minsToHours(shift.regularTime)
  const overtimeHrs = minsToHours(shift.overTime)
  const breakMins   = Math.round(shift.breakTime.breakTime)
  const costCode    = mapCostCode(shift.costCodes)
  const approved    = shift.approvalStatus.isApproved ? 'approved' : 'pending'
  const notes       = [
    shift.notes?.trim() || null,
    `[BT Shift #${shift.id}]`,
  ].filter(Boolean).join('\n\n')

  const record = {
    bt_shift_id:    shift.id,
    job_id:         jobId,
    user_id:        userId,
    clock_in:       btTimestampToISO(shift.timeIn.timeStamp),
    clock_out:      btTimestampToISO(shift.timeOut.timeStamp),
    regular_hours:  regularHrs,
    overtime_hours: overtimeHrs,
    break_minutes:  breakMins,
    hourly_rate:    hourlyRate,
    overtime_rate:  hourlyRate ? parseFloat((hourlyRate * 1.5).toFixed(2)) : null,
    labor_cost:     shift.builderCost.value || null,
    cost_code:      costCode,
    notes,
    tags:           ['bt_import'],
    approval_status: approved,
    location_status: 'skipped',
    created_by:     MIGRATION_USER_ID,
  }

  if (dryRun) {
    console.log(`  🔍  [DRY] ${label}  ${regularHrs}h  $${shift.builderCost.value}`)
    stats.inserted++
    return
  }

  const { error } = await supabase
    .from('time_entries')
    .upsert(record, { onConflict: 'bt_shift_id', ignoreDuplicates: true })

  if (error) {
    console.error(`  ✗  ${label}:`, error.message)
    stats.errors++
  } else {
    console.log(`  ✓  ${label}  ${regularHrs}h  $${shift.builderCost.value}`)
    stats.inserted++
  }
}

// ─── From-file mode ───────────────────────────────────────────────────────────

interface BTRawFile {
  fetchedAt: string
  total:     number
  shifts:    BTShift[]
}

/** Read a pre-fetched BT shifts JSON file (handles single and double-encoded). */
function readShiftsFile(filePath: string): BTRawFile {
  const raw = fs.readFileSync(filePath, 'utf-8')
  // browser_evaluate sometimes double-encodes (returns JSON string of a JSON string)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return JSON.parse(parsed) as BTRawFile
    return parsed as BTRawFile
  } catch {
    throw new Error(`Cannot parse ${filePath} as JSON`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Parse CLI flags ────────────────────────────────────────────────────────
  const args        = process.argv.slice(2)
  const dryRun      = args.includes('--dry-run')
  const fromFileIdx = args.indexOf('--from-file')
  const fromIdx     = args.indexOf('--from')
  const toIdx       = args.indexOf('--to')
  const fromFile    = fromFileIdx !== -1 ? args[fromFileIdx + 1] : null
  const fromDate    = fromIdx !== -1 ? args[fromIdx + 1] : '2015-01-01'
  const toDate      = toIdx   !== -1 ? args[toIdx   + 1] : new Date().toISOString().slice(0, 10)

  console.log('\n🕐  BuilderTrend → BuildOS  Time Clock Import')
  console.log(`    Mode       : ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`)

  const stats: Stats = { inserted: 0, skipped: 0, errors: 0 }

  // ── Branch: --from-file (no browser needed) ────────────────────────────────
  if (fromFile) {
    const absPath = path.resolve(process.cwd(), fromFile)
    console.log(`    Source     : ${absPath}`)
    if (!fs.existsSync(absPath)) {
      console.error(`\n❌  File not found: ${absPath}`)
      process.exit(1)
    }

    const fileData = readShiftsFile(absPath)
    console.log(`    Fetched at : ${fileData.fetchedAt ?? 'unknown'}`)
    console.log(`    Total in file: ${fileData.total ?? fileData.shifts.length}\n`)

    // Optional date filter
    const from = new Date(fromDate + 'T00:00:00Z')
    const to   = new Date(toDate   + 'T23:59:59Z')
    const filtered = fileData.shifts.filter(s => {
      if (fromIdx === -1 && toIdx === -1) return true  // no filter specified
      const d = new Date(s.timeIn.timeStamp + 'Z')
      return d >= from && d <= to
    })

    if (fromIdx !== -1 || toIdx !== -1) {
      console.log(`    Date filter: ${fromDate} → ${toDate}  (${filtered.length} of ${fileData.shifts.length} shifts)\n`)
    }

    console.log('📥  Importing shifts from file…\n')
    for (const shift of filtered) {
      await importShift(shift, dryRun, stats)
    }

  } else {
    // ── Branch: browser mode ────────────────────────────────────────────────
    console.log(`    Date range : ${fromDate} → ${toDate}`)
    console.log(`    Session    : ${BT_SESSION_DIR}\n`)

    const sessionExists = fs.existsSync(BT_SESSION_DIR) &&
      fs.readdirSync(BT_SESSION_DIR).some(f => f === 'Default')
    const context = await chromium.launchPersistentContext(BT_SESSION_DIR, {
      headless: sessionExists,
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()

    console.log('🌐  Opening BuilderTrend…')
    await page.goto(BT_HOME_URL, { waitUntil: 'networkidle', timeout: 60_000 })

    if (page.url().includes('login') || page.url().includes('Login')) {
      console.log('\n🔐  Please log in to BuilderTrend in the browser window.')
      console.log('    Waiting up to 5 minutes for login to complete…\n')
      await page.waitForURL('**/app/**', { timeout: 300_000 })
      await page.goto(BT_HOME_URL, { waitUntil: 'networkidle', timeout: 30_000 })
    }

    console.log('✅  BT session active\n')

    console.log('📋  Fetching BT job list…')
    let jobIds: number[]
    try {
      jobIds = await fetchBtJobIds(page)
      console.log(`    Found ${jobIds.length} jobs: ${jobIds.join(', ')}\n`)
    } catch {
      // Fallback to known job IDs if job picker API fails
      jobIds = [27087080, 43587803, 39174515, 44477710, 44678885, 41939994, 44914837]
      console.warn(`    ⚠  Job picker failed, using ${jobIds.length} known job IDs\n`)
    }

    let pageNum = 1
    let totalShifts = 0

    console.log('📥  Fetching shifts…\n')

    while (true) {
      const gridData = await fetchBtShiftsPage(page, jobIds, pageNum, fromDate, toDate)

      if (pageNum === 1) {
        totalShifts = gridData.records
        console.log(`    Total shifts in BT: ${totalShifts}  (${gridData.totalPages} page(s))\n`)
      }

      if (!gridData.data || gridData.data.length === 0) break

      console.log(`── Page ${pageNum} / ${gridData.totalPages} (${gridData.data.length} shifts) ──`)

      for (const shift of gridData.data) {
        await importShift(shift, dryRun, stats)
      }

      if (pageNum >= gridData.totalPages) break
      pageNum++
      await new Promise<void>(r => setTimeout(r, 300))
    }

    await context.close()
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────')
  console.log(`✅  Done!`)
  console.log(`    Inserted / updated : ${stats.inserted}`)
  console.log(`    Skipped            : ${stats.skipped}`)
  console.log(`    Errors             : ${stats.errors}`)
  if (dryRun) console.log('\n    ⚠  Dry-run mode — nothing was written to the database.')
  console.log()
}

main().catch(err => {
  console.error('\n💥  Import failed:', err)
  process.exit(1)
})
