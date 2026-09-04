// Parses JDC estimate workbooks (.xlsx) into typed line items.
//
// Two layouts are in circulation and both are supported:
//
// "detailed" — the estimating system's own export, and the canonical shape:
//   Phase | Div# | Division | Cost Code | Description | Qty | Unit
//        | Labor $ | Material $ | SubC $ | Other $ | Total Cost | Total Price | Notes
//   Cost is split across columns, and the money figures are extended amounts for the
//   line rather than unit rates. Rows above the header carry job metadata.
//
// "combined" — the hand-maintained sheets kept in SharePoint job folders:
//   Cost Code | Title | Description | Unit Cost | Quantity | Unit of Measure
//        | Total Cost | Markup | Internal Notes
//   Here "Cost Code" is really "{div} {division name} {cost type}", the real cost code is
//   the prefix of "Description", and each cost type gets its own row.
//
// Both are normalised to the same output: one line per cost type, carrying a unit cost.
// Anything else — Buildertrend exports, selection sheets, the cost catalog workbook — is
// rejected rather than imported, so callers can record it as quarantined.

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

/** Job details carried in the rows above the header of a detailed export. */
export interface ParsedEstimateMeta {
  title:         string | null
  client_name:   string | null
  address:       string | null
  estimate_ref:  string | null
  date_started:  string | null
  last_modified: string | null
}

export interface ParsedEstimate {
  layout:      'detailed' | 'combined'
  meta:        ParsedEstimateMeta
  lines:       ParsedEstimateLine[]
  areas:       string[]
  divisions:   string[]
  totalCost:   number
  /** Marked-up total, when the workbook states one. */
  totalPrice:  number
  /** Concatenated area + description text used for similarity matching. */
  fingerprint: string
  /** Rows that looked like data but carried no numbers; surfaced for review, not fatal. */
  skippedRows: number
}

export class WorkbookNotAnEstimateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkbookNotAnEstimateError'
  }
}

/**
 * The workbook is a valid estimate that was created but never filled in. Distinct from
 * an unrecognised layout: an empty estimate needs no follow-up, whereas an unrecognised
 * one means the parser has a gap worth closing.
 */
export class EmptyEstimateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmptyEstimateError'
  }
}

// ─── Layout definitions ───────────────────────────────────────────────────────

type ColumnKey =
  | 'phase' | 'divNum' | 'divisionName' | 'costCode' | 'description' | 'quantity' | 'uom'
  | 'labor' | 'material' | 'subc' | 'other' | 'totalCost' | 'totalPrice' | 'notes'
  | 'title' | 'unitCost' | 'markup'

type ColumnMap = Partial<Record<ColumnKey, number>>

const ALIASES: Record<ColumnKey, string[]> = {
  phase:        ['phase'],
  divNum:       ['div#', 'div #', 'division #', 'division num'],
  divisionName: ['division'],
  costCode:     ['cost code', 'costcode'],
  description:  ['description'],
  quantity:     ['qty', 'quantity'],
  uom:          ['unit', 'unit of measure', 'uom', 'unit type'],
  labor:        ['labor $', 'labor', 'labour $', 'labour'],
  material:     ['material $', 'material', 'materials $', 'materials'],
  subc:         ['subc $', 'subc', 'subcontract $', 'subcontract'],
  other:        ['other $', 'other'],
  totalCost:    ['total cost'],
  totalPrice:   ['total price'],
  notes:        ['notes', 'internal notes', 'note'],
  title:        ['title'],
  unitCost:     ['unit cost', 'unit price'],
  markup:       ['markup', 'markup %'],
}

/**
 * Columns that must all be present for a sheet to be treated as that layout.
 * These are deliberately tight: the cost catalog workbook also has "Cost Code",
 * "Description" and "Unit Cost", and must not be mistaken for an estimate.
 */
const LAYOUT_REQUIREMENTS = {
  detailed: ['phase', 'costCode', 'description', 'quantity', 'totalCost'],
  combined: ['costCode', 'title', 'description', 'unitCost', 'quantity'],
} as const satisfies Record<string, readonly ColumnKey[]>

type Layout = keyof typeof LAYOUT_REQUIREMENTS

function normalizeHeader(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[\s_]+/g, ' ').trim()
}

/** Scans the first rows for a header matching one of the known layouts. */
function findHeader(rows: unknown[][]): { index: number; layout: Layout; columns: ColumnMap } | null {
  const limit = Math.min(rows.length, 25)

  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader)
    if (cells.every(c => c === '')) continue

    const columns: ColumnMap = {}
    for (const key of Object.keys(ALIASES) as ColumnKey[]) {
      const idx = cells.findIndex(cell => cell !== '' && ALIASES[key].includes(cell))
      if (idx !== -1) columns[key] = idx
    }

    for (const layout of Object.keys(LAYOUT_REQUIREMENTS) as Layout[]) {
      if (LAYOUT_REQUIREMENTS[layout].every(c => columns[c] !== undefined)) {
        return { index: i, layout, columns }
      }
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
 * and parenthesised negatives. Returns null when there is no usable number, so callers
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

// ─── Compound-column splitting (combined layout only) ─────────────────────────

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

/** Splits "14 Plumbing Materials" into { num: "14", name: "Plumbing", type: "materials" }. */
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

  return { division_num, division_name: words.join(' ').trim() || null, cost_type }
}

/** Splits "14.1320.010 Lavatory/vanity" into its code and description. */
export function parseDescriptionCell(raw: string): { cost_code: string | null; description: string } {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { cost_code: null, description: '' }

  const match = text.match(/^(\d{1,2}(?:\.\d+)+)\.?\s+(.*)$/)
  if (!match) return { cost_code: null, description: text }

  const description = match[2].trim()
  // A code with nothing behind it is a section label, not a line item.
  if (!description) return { cost_code: null, description: text }

  return { cost_code: match[1], description }
}

/** "02.2200." → "02.2200"; the trailing dot is a separator, not part of the code. */
function tidyCostCode(raw: string): string | null {
  const text = raw.trim().replace(/\.+$/, '')
  return text || null
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

/** Reads the label/value pairs above the header of a detailed export. */
function parseMeta(rows: unknown[][], headerIndex: number): ParsedEstimateMeta {
  const meta: ParsedEstimateMeta = {
    title: null, client_name: null, address: null,
    estimate_ref: null, date_started: null, last_modified: null,
  }

  const fields: [RegExp, keyof ParsedEstimateMeta][] = [
    [/^client:?$/i,        'client_name'],
    [/^address:?$/i,       'address'],
    [/^estimate id:?$/i,   'estimate_ref'],
    [/^date started:?$/i,  'date_started'],
    [/^last modified:?$/i, 'last_modified'],
  ]

  for (let i = 0; i < headerIndex; i++) {
    const row = rows[i] ?? []
    // The first non-empty row above the header is the estimate's own title.
    if (meta.title === null) {
      const first = String(row[0] ?? '').trim()
      if (first && !fields.some(([re]) => re.test(first))) meta.title = first
    }
    // Labels and values sit in adjacent cells, and there are two pairs per row.
    for (let c = 0; c < row.length; c++) {
      const label = String(row[c] ?? '').trim()
      for (const [re, key] of fields) {
        if (re.test(label)) {
          const value = String(row[c + 1] ?? '').trim()
          if (value && meta[key] === null) meta[key] = value
        }
      }
    }
  }
  return meta
}

// ─── Main entry point ─────────────────────────────────────────────────────────

const UOM_FALLBACK = 'EA'

/**
 * Parses an estimate workbook.
 * @throws {WorkbookNotAnEstimateError} when no sheet matches a known estimate layout.
 */
export function parseEstimateWorkbook(buffer: ArrayBuffer | Buffer): ParsedEstimate {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  let sawKnownLayout = false

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true })
    const header = findHeader(rows)
    if (!header) continue

    sawKnownLayout = true
    const parsed = header.layout === 'detailed'
      ? parseDetailed(rows, header.index, header.columns)
      : parseCombined(rows, header.index, header.columns)

    if (parsed.lines.length > 0) return parsed
  }

  // A recognised header with no line items is an estimate nobody ever filled in.
  if (sawKnownLayout) {
    throw new EmptyEstimateError('Estimate has a valid header but no line items')
  }

  throw new WorkbookNotAnEstimateError(
    'No sheet matches a known estimate layout (detailed export or SharePoint estimate sheet)'
  )
}

// ─── Detailed layout ──────────────────────────────────────────────────────────

/** Cost columns in the detailed export, mapped to the cost type they represent. */
const COST_BUCKETS: [ColumnKey, CostType][] = [
  ['labor',    'labor'],
  ['material', 'materials'],
  ['subc',     'subcontract'],
  ['other',    'other'],
]

function parseDetailed(rows: unknown[][], headerIndex: number, columns: ColumnMap): ParsedEstimate {
  const lines: ParsedEstimateLine[] = []
  const areas = new Set<string>()
  const divisions = new Set<string>()
  let skippedRows = 0
  let totalCost = 0
  let totalPrice = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue

    const description = cell(row, columns.description)
    const rowCost     = num(row, columns.totalCost)
    const rowPrice    = num(row, columns.totalPrice)

    // Area banners ("  Bath 1") and division banners ("02", "  Site Preparation") carry
    // text but no money. They organise the sheet; they are not line items.
    if (!description || rowCost === null) {
      if (description) skippedRows++
      continue
    }

    const area          = cell(row, columns.phase) || null
    const division_num  = cell(row, columns.divNum) || null
    const division_name = cell(row, columns.divisionName) || null
    const cost_code     = tidyCostCode(cell(row, columns.costCode))
    const uom           = (cell(row, columns.uom) || UOM_FALLBACK).toUpperCase()

    // Quantity of 0 would make every derived unit cost infinite; treat it as a single unit.
    const rawQty  = num(row, columns.quantity)
    const quantity = rawQty && rawQty !== 0 ? rawQty : 1

    // Markup is not stated per line, but both the cost and the marked-up price are,
    // so the line's own markup falls out of the pair. It genuinely varies by line —
    // some items are passed through at cost.
    const markup_pct = rowCost > 0 && rowPrice !== null
      ? round2(((rowPrice / rowCost) - 1) * 100)
      : 0

    totalCost  += rowCost
    totalPrice += rowPrice ?? rowCost

    // One source row holds up to four cost types side by side. Splitting them into
    // separate lines matches how the SharePoint sheets are written and makes the
    // cost-code history answerable per cost type.
    const buckets = COST_BUCKETS
      .map(([key, type]) => ({ type, amount: num(row, columns[key]) ?? 0 }))
      .filter(b => b.amount !== 0)

    const emit = (cost_type: CostType | null, amount: number) => {
      lines.push({
        row_number: i + 1,
        cost_code, division_num, division_name, cost_type, area, description, uom,
        quantity,
        unit_cost:  round4(amount / quantity),
        total_cost: round2(amount),
        markup_pct,
        internal_notes: cell(row, columns.notes) || null,
      })
    }

    if (buckets.length > 0) buckets.forEach(b => emit(b.type, b.amount))
    else emit(null, rowCost)   // cost recorded but not attributed to a type

    if (area) areas.add(area)
    if (division_num && division_name) divisions.add(`${division_num} ${division_name}`)
  }

  return {
    layout: 'detailed',
    meta: parseMeta(rows, headerIndex),
    lines,
    areas:       [...areas],
    divisions:   [...divisions],
    totalCost:   round2(totalCost),
    totalPrice:  round2(totalPrice),
    fingerprint: buildFingerprint([...areas], [...divisions], lines),
    skippedRows,
  }
}

// ─── Combined layout ──────────────────────────────────────────────────────────

function parseCombined(rows: unknown[][], headerIndex: number, columns: ColumnMap): ParsedEstimate {
  const lines: ParsedEstimateLine[] = []
  const areas = new Set<string>()
  const divisions = new Set<string>()
  let skippedRows = 0

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue

    const quantity = num(row, columns.quantity)
    const unitCost = num(row, columns.unitCost)
    const { cost_code, description } = parseDescriptionCell(cell(row, columns.description))

    if (!description) continue
    if (quantity === null && unitCost === null) {
      skippedRows++
      continue
    }

    const { division_num, division_name, cost_type } = parseDivisionCell(cell(row, columns.costCode))
    const area = cell(row, columns.title) || null

    const qty  = quantity ?? 0
    const cost = unitCost ?? 0
    // Trust the sheet's own total when present; it reflects any rounding the operator applied.
    const total = num(row, columns.totalCost) ?? qty * cost

    lines.push({
      row_number: i + 1,
      cost_code, division_num, division_name, cost_type, area, description,
      uom:        (cell(row, columns.uom) || UOM_FALLBACK).toUpperCase(),
      quantity:   qty,
      unit_cost:  cost,
      total_cost: round2(total),
      markup_pct: num(row, columns.markup) ?? 0,
      internal_notes: cell(row, columns.notes) || null,
    })

    if (area) areas.add(area)
    if (division_num && division_name) divisions.add(`${division_num} ${division_name}`)
  }

  const totalCost = round2(lines.reduce((sum, l) => sum + l.total_cost, 0))
  const totalPrice = round2(lines.reduce((sum, l) => sum + l.total_cost * (1 + l.markup_pct / 100), 0))

  return {
    layout: 'combined',
    meta: { title: null, client_name: null, address: null, estimate_ref: null, date_started: null, last_modified: null },
    lines,
    areas:       [...areas],
    divisions:   [...divisions],
    totalCost,
    totalPrice,
    fingerprint: buildFingerprint([...areas], [...divisions], lines),
    skippedRows,
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * The line-level text the similarity search runs against. Areas and divisions lead it as
 * well, even though they are also stored as their own columns and weighted separately in
 * the search vector — repeating them here lets a job's rooms and trades reinforce a match
 * that the line descriptions alone would rank lower.
 */
function buildFingerprint(areas: string[], divisions: string[], lines: ParsedEstimateLine[]): string {
  const descriptions = [...new Set(lines.map(l => l.description))]
  return [areas.join(' '), areas.join(' '), divisions.join(' '), descriptions.join(' ')]
    .join(' ').replace(/\s+/g, ' ').trim()
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round4(n: number): number { return Math.round(n * 10000) / 10000 }
