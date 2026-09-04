#!/usr/bin/env tsx
/**
 * Historical Estimate Import
 * ==========================
 * Seeds `historical_estimates` / `historical_estimate_lines` from a folder of estimate
 * workbooks exported from the estimating system (named "{estimate id} - {client}.xlsx").
 *
 * These line items are the pricing basis the AI estimate generator builds from, so this
 * is what turns that feature from market-rate guessing into the company's own numbers.
 *
 * Estimates are linked to a job where a confident name match exists. Unmatched estimates
 * are still imported and still usable as comparables — they just show their own title
 * instead of a job name.
 *
 * Safe to re-run: rows are upserted on the estimating system's own estimate id.
 *
 * Usage
 * -----
 *   npx tsx scripts/import-estimates.ts --dir ./Estimates             # import
 *   npx tsx scripts/import-estimates.ts --dir ./Estimates --dry-run   # preview only
 */

import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'
import {
  parseEstimateWorkbook,
  WorkbookNotAnEstimateError,
  EmptyEstimateError,
  type ParsedEstimate,
} from '../src/lib/integrations/microsoft/estimateWorkbookParser'

// ─── Env ──────────────────────────────────────────────────────────────────────
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

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const args   = process.argv.slice(2)
const dirArg = args[args.indexOf('--dir') + 1]
const dryRun = args.includes('--dry-run')

if (!dirArg || dirArg.startsWith('--')) {
  console.error('Usage: npx tsx scripts/import-estimates.ts --dir <folder> [--dry-run]')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY, { auth: { persistSession: false } })

// ─── Job matching ─────────────────────────────────────────────────────────────

interface Job { id: string; name: string }

/** Strips punctuation and collapses whitespace so names compare fairly. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The client's surname, which is what jobs are usually named after.
 * "Elli Lange" → "lange"; the file's "Lange, Elli" form is handled too.
 */
function surnameOf(clientName: string | null): string | null {
  if (!clientName) return null
  const cleaned = normalizeName(clientName)
  if (!cleaned) return null
  if (clientName.includes(',')) return normalizeName(clientName.split(',')[0]) || null
  const parts = cleaned.split(' ')
  return parts[parts.length - 1] || null
}

type MatchMethod = 'title_exact' | 'title_prefix' | 'surname' | null

/**
 * Links an estimate to a job by name. Ordered most to least certain; an ambiguous
 * surname (several jobs share it) is left unmatched rather than guessed, since a wrong
 * link would attribute one client's pricing to another's job.
 */
function matchJob(
  parsed: ParsedEstimate,
  fileName: string,
  jobs: Job[]
): { job: Job | null; method: MatchMethod; confidence: number } {
  const title = normalizeName(parsed.meta.title ?? fileName.replace(/^\d+\s*-\s*/, '').replace(/\.xlsx$/i, ''))

  const exact = jobs.filter(j => normalizeName(j.name) === title)
  if (exact.length === 1) return { job: exact[0], method: 'title_exact', confidence: 1 }

  // "Lange Bathroom" against a job named "Lange": the job name leads the title.
  const prefix = jobs.filter(j => {
    const n = normalizeName(j.name)
    return n.length >= 4 && (title.startsWith(n + ' ') || title === n)
  })
  if (prefix.length === 1) return { job: prefix[0], method: 'title_prefix', confidence: 0.85 }

  const surname = surnameOf(parsed.meta.client_name)
  if (surname && surname.length >= 4) {
    const bySurname = jobs.filter(j => {
      const n = normalizeName(j.name)
      return n === surname || n.startsWith(surname + ' ')
    })
    if (bySurname.length === 1) return { job: bySurname[0], method: 'surname', confidence: 0.7 }
  }

  return { job: null, method: null, confidence: 0 }
}

/** "01/03/2024" → "2024-01-03"; anything unparseable becomes null rather than a bad date. */
function toIsoDate(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dir = path.resolve(dirArg)
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.xlsx')).sort()
  console.log(`Found ${files.length} workbooks in ${dir}${dryRun ? '  (DRY RUN)' : ''}\n`)

  const { data: jobs, error: jobsErr } = await db.from('jobs').select('id, name')
  if (jobsErr) { console.error('Failed to load jobs:', jobsErr.message); process.exit(1) }
  console.log(`Loaded ${jobs!.length} jobs for name matching\n`)

  const stats = {
    imported: 0, empty: 0, quarantined: 0, errored: 0,
    lines: 0, cost: 0, matched: 0,
  }
  const byMethod: Record<string, number> = {}
  const unmatched: string[] = []

  for (const file of files) {
    let parsed: ParsedEstimate
    try {
      parsed = parseEstimateWorkbook(fs.readFileSync(path.join(dir, file)))
    } catch (e) {
      if (e instanceof EmptyEstimateError)          { stats.empty++;       continue }
      if (e instanceof WorkbookNotAnEstimateError)  { stats.quarantined++;
        console.log(`  QUARANTINED  ${file}`);      continue }
      stats.errored++
      console.log(`  ERROR        ${file} :: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    const { job, method, confidence } = matchJob(parsed, file, jobs as Job[])
    if (job) { stats.matched++; byMethod[method!] = (byMethod[method!] ?? 0) + 1 }
    else unmatched.push(parsed.meta.title ?? file)

    stats.imported++
    stats.lines += parsed.lines.length
    stats.cost  += parsed.totalCost

    if (dryRun) continue

    const { data: saved, error: upsertErr } = await db
      .from('historical_estimates')
      .upsert({
        job_id:       job?.id ?? null,
        source_kind:  'import',
        layout:       parsed.layout,
        drive_id:     null,
        item_id:      null,
        file_name:    file,
        estimate_ref: parsed.meta.estimate_ref,
        display_name: parsed.meta.title,
        client_name:  parsed.meta.client_name,
        address:      parsed.meta.address,
        date_started: toIsoDate(parsed.meta.date_started),
        source_year:  toIsoDate(parsed.meta.date_started)?.slice(0, 4) ?? null,
        parse_status: 'ok',
        line_count:   parsed.lines.length,
        total_cost:   parsed.totalCost,
        total_price:  parsed.totalPrice,
        areas:        parsed.areas,
        divisions:    parsed.divisions,
        fingerprint:  parsed.fingerprint,
        job_match_method:     method,
        job_match_confidence: confidence || null,
        synced_at:    new Date().toISOString(),
      }, { onConflict: 'estimate_ref' })
      .select('id')
      .single()

    if (upsertErr || !saved) {
      stats.errored++
      console.log(`  ERROR        ${file} :: ${upsertErr?.message ?? 'upsert failed'}`)
      continue
    }

    // Replace lines wholesale so a re-import of a revised file leaves nothing stale.
    await db.from('historical_estimate_lines').delete().eq('historical_estimate_id', saved.id)

    const rows = parsed.lines.map(l => ({
      historical_estimate_id: saved.id,
      job_id:         job?.id ?? null,
      row_number:     l.row_number,
      cost_code:      l.cost_code,
      division_num:   l.division_num,
      division_name:  l.division_name,
      cost_type:      l.cost_type,
      area:           l.area,
      description:    l.description,
      uom:            l.uom,
      quantity:       l.quantity,
      unit_cost:      l.unit_cost,
      total_cost:     l.total_cost,
      markup_pct:     l.markup_pct,
      internal_notes: l.internal_notes,
    }))

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('historical_estimate_lines').insert(rows.slice(i, i + 500))
      if (error) { console.log(`  LINE ERROR   ${file} :: ${error.message}`); break }
    }
  }

  console.log('\n─── Summary ───────────────────────────────')
  console.log(`  imported      ${stats.imported}`)
  console.log(`  empty         ${stats.empty}  (created but never filled in)`)
  console.log(`  quarantined   ${stats.quarantined}`)
  console.log(`  errored       ${stats.errored}`)
  console.log(`  line items    ${stats.lines.toLocaleString()}`)
  console.log(`  total cost    $${Math.round(stats.cost).toLocaleString()}`)
  console.log(`\n  linked to a job  ${stats.matched}/${stats.imported}`)
  for (const [m, n] of Object.entries(byMethod)) console.log(`    ${m.padEnd(13)} ${n}`)
  if (unmatched.length) {
    console.log(`  unlinked         ${unmatched.length} (still usable as comparables)`)
    unmatched.slice(0, 10).forEach(u => console.log(`    ${u}`))
    if (unmatched.length > 10) console.log(`    …and ${unmatched.length - 10} more`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
