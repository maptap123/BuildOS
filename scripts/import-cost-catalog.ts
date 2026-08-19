#!/usr/bin/env tsx
/**
 * Cost Catalog Import
 * ====================
 * Seeds `public.cost_catalog` from the "CorrectedCodes.xlsx" cost book export.
 * Source has two sheets: "All Cost Codes" (the full historical code library,
 * with a Notes column showing recent-usage stats) and "Cost Book Active" (the
 * current curated subset). Every code from "All Cost Codes" is imported; codes
 * that also appear in "Cost Book Active" are marked is_active = true, the rest
 * is_active = false (searchable in the estimate builder, but not surfaced by
 * default). Safe to re-run — upserts on the cost_code unique index added in
 * migration 035.
 *
 * The DB schema has no separate subcontractor/other-cost columns, so
 * `material_cost` = spreadsheet Material + Sub Contractor + Other, keeping
 * labor_cost + material_cost equal to the spreadsheet's own Unit Cost total.
 *
 * Usage
 * -----
 *   npx tsx scripts/import-cost-catalog.ts --file "C:\path\to\CorrectedCodes.xlsx"           # import
 *   npx tsx scripts/import-cost-catalog.ts --file "C:\path\to\CorrectedCodes.xlsx" --dry-run  # preview only
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as path from 'path'
import * as fs from 'fs'

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
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const fileIdx = args.indexOf('--file')
const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null

if (!filePath) {
  console.error('Usage: npx tsx scripts/import-cost-catalog.ts --file "<path to CorrectedCodes.xlsx>" [--dry-run]')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SheetRow = [string, string, string, ...unknown[]] // Division, Cost Code, Description, ...

interface CatalogRow {
  cost_code: string
  division_num: string
  division_name: string
  title: string
  description: string | null
  uom: string
  unit_cost: number
  labor_cost: number
  material_cost: number
  is_active: boolean
  taxable: boolean
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function splitDivision(division: string): { num: string; name: string } {
  const m = division.match(/^(\d+)\s*-\s*(.+)$/)
  return m ? { num: m[1], name: m[2].trim() } : { num: '', name: division.trim() }
}

// ─── Parse ────────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(filePath)

const activeSheet = wb.Sheets['Cost Book Active']
const allSheet = wb.Sheets['All Cost Codes']
if (!activeSheet || !allSheet) {
  console.error(`Expected sheets "Cost Book Active" and "All Cost Codes", found: ${wb.SheetNames.join(', ')}`)
  process.exit(1)
}

const activeRows = XLSX.utils.sheet_to_json(activeSheet, { header: 1, raw: true }) as SheetRow[]
const allRows = XLSX.utils.sheet_to_json(allSheet, { header: 1, raw: true }) as SheetRow[]

// "Cost Book Active" header: Division, Cost Code, Description, Qty, Unit, Labor, Material, Sub Contractor, Other, Unit Cost
const activeCodes = new Set(
  activeRows.slice(1).map(r => String(r[1] ?? '').trim()).filter(Boolean),
)

// "All Cost Codes" header: Division, Cost Code, Description, Notes, Qty, Unit, Labor, Material, Sub Contractor, Other, Unit Cost
const seen = new Set<string>()
const catalog: CatalogRow[] = []
let skippedNoCode = 0
let skippedDupe = 0

for (const r of allRows.slice(1)) {
  const [divisionRaw, codeRaw, descRaw, notesRaw, , unitRaw, laborRaw, materialRaw, subRaw, otherRaw, unitCostRaw] = r
  const cost_code = String(codeRaw ?? '').trim()
  if (!cost_code) { skippedNoCode++; continue }
  if (seen.has(cost_code)) { skippedDupe++; continue }
  seen.add(cost_code)

  const { num: division_num, name: division_name } = splitDivision(String(divisionRaw ?? '').trim())
  const labor_cost = num(laborRaw)
  const material_cost = num(materialRaw) + num(subRaw) + num(otherRaw)
  const unit_cost = num(unitCostRaw) || (labor_cost + material_cost)
  const notes = String(notesRaw ?? '').trim()

  catalog.push({
    cost_code,
    division_num: division_num || '00',
    division_name: division_name || 'Uncategorized',
    title: String(descRaw ?? '').trim() || cost_code,
    description: notes || null,
    uom: String(unitRaw ?? '').trim() || 'EA',
    unit_cost,
    labor_cost,
    material_cost,
    is_active: activeCodes.has(cost_code),
    taxable: true,
  })
}

console.log(`Parsed ${catalog.length} unique cost codes (${skippedNoCode} rows with no code, ${skippedDupe} duplicate codes skipped).`)
console.log(`  ${catalog.filter(c => c.is_active).length} marked active (present in "Cost Book Active").`)
console.log('Sample:', JSON.stringify(catalog[0], null, 2))

if (dryRun) {
  console.log('\n--dry-run: no writes performed.')
  process.exit(0)
}

// ─── Write ────────────────────────────────────────────────────────────────────
async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const BATCH = 500
  let written = 0
  for (let i = 0; i < catalog.length; i += BATCH) {
    const batch = catalog.slice(i, i + BATCH)
    const { error } = await admin.from('cost_catalog').upsert(batch, { onConflict: 'cost_code' })
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} failed:`, error.message)
      process.exit(1)
    }
    written += batch.length
    console.log(`  upserted ${written}/${catalog.length}`)
  }

  console.log(`\nDone. ${written} cost catalog rows upserted.`)
}

main()
