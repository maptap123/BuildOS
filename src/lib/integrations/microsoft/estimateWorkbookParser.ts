// Parses JDC estimate workbooks (.xlsx) stored in SharePoint into typed line items.
//
// The sheets follow a stable 9-column layout:
//   Cost Code | Title | Description | Unit Cost | Quantity | Unit of Measure | Total Cost | Markup | Internal Notes
//
// Two of those columns are compound and need splitting:
//   "Cost Code"   → "{division_num} {division_name} {cost_type}"  e.g. "14 Plumbing Materials"
//   "Description" → "{cost_code} {description}"                   e.g. "14.1320.010 Lavatory/vanity, 21D 36W"
//
// "Title" is the room or area the line belongs to ("Bath 1", "Kitchen", "Overall Job").
//
// Older folders also hold Buildertrend exports, selection sheets and cost sheets under
// estimate-ish filenames. Those do not carry this header, so the parser rejects them
// rather than importing garbage — callers record the rejection as 'quarantined'.

import * as XLSX from 'xlsx'

export type CostType = 'labor' | 'materials' | 'subcontract' | 'equipment' | 'other'

export interface ParsedEstimateLine {
  row_number:     number
  cost_code:      string | null
  division_num:   string | null
  division_name:  string | null
  cost_type:      CostType | null
  area:           string | null
  description:    string
  uom:            string
  quantity:       number
  unit_cost:      number
  total_cost:     number
  markup_pct:     number
  internal_notes: string | null
}

export interface ParsedEstimate {
  lines:      ParsedEstimateLine[]
  areas:      string[]
  divisions:  string[]
  totalCost:  number
  /** Concatenated area + description text used for similarity matching. */
  fingerprint: string
  /** Rows that looked like data but could not be read; surfaced for review, not fatal. */
  skippedRows: number
}

export class WorkbookNotAnEstimateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkbookNotAnEstimateError'
  }
}

// ─── Column resolution ────────────────────────────────────────────────────────

/** Canonical header name → the aliases seen across years of hand-copied workbooks. */
const COLUMN_ALIASES: Record<string, string[]> = {
  costCode:    ['cost code', 'costcode', 'code', 'division'],
  title:       ['title', 'area', 'room', 'location'],
  description: ['description', 'item', 'work item'],
  unitCost:    ['unit cost', 'unitcost', 'unit price', 'cost'],
  quantity:    ['quantity', 'qty'],
  uom:         ['unit of measure', 'uom', 'unit', 'units'],
  totalCost:   ['total cost', 'totalcost', 'total', 'total price', 'amount'],
  markup:      ['markup', 'markup %', 'markup pct', 'margin'],
  notes:       ['internal notes', 'notes', 'note', 'internal note'],
}

/** Columns without which the sheet is not a JDC estimate. */
const REQUIRED_COLUMNS = ['costCode', 'description', 'unitCost', 'quantity'] as const

type ColumnMap = Partial<Record<keyof typeof COLUMN_ALIASES, number>>

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

/**
 * Scans the first rows for the header. Workbooks occasionally carry a title row or a
 * blank row above the header, so we look rather than assume row 0.
 */
function findHeaderRow(rows: unknown[][]): { index: number; columns: ColumnMap } | null {
  const limit = Math.min(rows.length, 25)

  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader)
    if (cells.every(c => c === '')) continue

    const columns: ColumnMap = {}
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      const idx = cells.findIndex(cell => cell !== '' && aliases.includes(cell))
      if (idx !== -1) columns[key as keyof typeof COLUMN_ALIASES] = idx
    }

    if (REQUIRED_COLUMNS.every(c => columns[c] !== undefined)) {
      return { index: i, columns }
    }
  }
  return null
}

// ─── Cell coercion ────────────────────────────────────────────────────────────

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return ''
  return String(row[idx] ?? '').trim()
}

/**
 * Reads a numeric cell. Tolerates currency symbols, thousands separators, blank cells
 * and parenthesised negatives. Returns null when there is no usable number so callers
 * can distinguish "absent" from "zero".
 */
function num(row: unknown[], idx: number | undefined): number | null {
  if (idx === undefined) return null
  const raw = row[idx]
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

  const text = String(raw).trim()
  const negative = /^\(.*\)$/.test(text)
  const cleaned = text.replace(/[()]/g, '').replace(/[$,\s]/g, '').replace(/%$/, '')
  if (cleaned === '' || cleaned === '-') return null

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

// ─── Compound-column splitting ────────────────────────────────────────────────

const COST_TYPE_BY_WORD: Record<string, CostType> = {
  labor: 'labor', labour: 'labor',
  material: 'materials', materials: 'materials',
  subcontract: 'subcontract', subcontractor: 'subcontract', sub: 'subcontract',
  equipment: 'equipment',
  other: 'other',
}

interface DivisionParts {
  division_num:  string | null
  division_name: string | null
  cost_type:     CostType | null
}

/**
 * Splits "14 Plumbing Materials" into { num: "14", name: "Plumbing", type: "materials" }.
 * Division names can contain multiple words ("20 Millwork  Trim Labor"), so the cost type
 * is taken from the trailing word and the remainder is the name.
 */
export function parseDivisionCell(raw: string): DivisionParts {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { division_num: null, division_name: null, cost_type: null }

  const words = text.split(' ')
  let cost_type: CostType | null = null

  const lastWord = words[words.length - 1]?.toLowerCase() ?? ''
  if (COST_TYPE_BY_WORD[lastWord]) {
    cost_type = COST_TYPE_BY_WORD[lastWord]
    words.pop()
  }

  let division_num: string | null = null
  if (/^\d{1,2}$/.test(words[0] ?? '')) {
    division_num = words.shift()!.padStart(2, '0')
  }

  const division_name = words.join(' ').trim() || null
  return { division_num, division_name, cost_type }
}

/**
 * Splits "14.1320.010 Lavatory/vanity, 21D 36W" into its code and description.
 * Codes appear as "02.3070." or "01.0000.010" — a trailing dot is separator, not part
 * of the code. Rows without a leading code keep their full text as the description.
 */
export function parseDescriptionCell(raw: string): { cost_code: string | null; description: string } {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { cost_code: null, description: '' }

  const match = text.match(/^(\d{1,2}(?:\.\d+)+)\.?\s+(.*)$/)
  if (!match) return { cost_code: null, description: text }

  const description = match[2].trim()
  // A code with no description behind it is more likely a section label than a line item.
  if (!description) return { cost_code: null, description: text }

  return { cost_code: match[1], description }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const UOM_FALLBACK = 'EA'

/**
 * Parses an estimate workbook.
 * @throws {WorkbookNotAnEstimateError} when no sheet carries the expected header.
 */
export function parseEstimateWorkbook(buffer: ArrayBuffer | Buffer): ParsedEstimate {
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true })
    const header = findHeaderRow(rows)
    if (!header) continue

    const parsed = parseRows(rows, header.index, header.columns)
    // A workbook with the right header but no readable rows is a template, not an estimate.
    if (parsed.lines.length > 0) return parsed
  }

  throw new WorkbookNotAnEstimateError(
    'No sheet contains the expected estimate header (Cost Code / Description / Unit Cost / Quantity)'
  )
}

function parseRows(rows: unknown[][], headerIndex: number, columns: ColumnMap): ParsedEstimate {
  const lines: ParsedEstimateLine[] = []
  const areas = new Set<string>()
  const divisions = new Set<string>()
  let skippedRows = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue

    const divisionRaw = cell(row, columns.costCode)
    const descRaw     = cell(row, columns.description)
    const quantity    = num(row, columns.quantity)
    const unitCost    = num(row, columns.unitCost)

    const { cost_code, description } = parseDescriptionCell(descRaw)

    // Totals rows and section banners carry text but no numbers — skip them quietly.
    if (!description) continue
    if (quantity === null && unitCost === null) {
      skippedRows++
      continue
    }

    const { division_num, division_name, cost_type } = parseDivisionCell(divisionRaw)
    const area = cell(row, columns.title) || null

    const qty  = quantity ?? 0
    const cost = unitCost ?? 0
    // Trust the sheet's own total when present; it accounts for rounding the operator applied.
    const total = num(row, columns.totalCost) ?? qty * cost

    lines.push({
      row_number:     i + 1,
      cost_code,
      division_num,
      division_name,
      cost_type,
      area,
      description,
      uom:            (cell(row, columns.uom) || UOM_FALLBACK).toUpperCase(),
      quantity:       qty,
      unit_cost:      cost,
      total_cost:     total,
      markup_pct:     num(row, columns.markup) ?? 0,
      internal_notes: cell(row, columns.notes) || null,
    })

    if (area) areas.add(area)
    if (division_num && division_name) divisions.add(`${division_num} ${division_name}`)
  }

  const totalCost = lines.reduce((sum, l) => sum + l.total_cost, 0)

  return {
    lines,
    areas:       [...areas],
    divisions:   [...divisions],
    totalCost,
    fingerprint: buildFingerprint([...areas], [...divisions], lines),
    skippedRows,
  }
}

/**
 * The text the similarity search runs against. Areas and divisions are repeated ahead of
 * the line descriptions because they are the strongest signal of what kind of job this was
 * — a scope saying "master bath remodel" should match on "Bath 1" and "14 Plumbing" before
 * it matches an incidental line about baseboard.
 */
function buildFingerprint(
  areas: string[],
  divisions: string[],
  lines: ParsedEstimateLine[]
): string {
  const descriptions = [...new Set(lines.map(l => l.description))]
  return [
    areas.join(' '),
    areas.join(' '),
    divisions.join(' '),
    descriptions.join(' '),
  ].join(' ').replace(/\s+/g, ' ').trim()
}
