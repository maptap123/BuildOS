import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function summarizeDailyLog(logText: string): Promise<string> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 256,
      messages: [
        {
          role: 'system',
          content: 'You are a construction project assistant. Summarize the daily log entry in 2-3 concise sentences for a project manager. Focus on work completed, issues, and anything needing follow-up. Be direct and brief.',
        },
        { role: 'user', content: logText },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek ${res.status}: ${err}`)
  }

  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? logText
}

export async function estimateFromDescription(description: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system:
      'You are an experienced construction estimator. Given a project description, provide a structured cost estimate breakdown by trade. Be specific and practical. Format as a numbered list with cost ranges.',
    messages: [{ role: 'user', content: description }],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text : ''
}

export interface AISuggestedLine {
  description: string
  phase: string
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
  cost_code?: string
  rationale?: string
}

const ESTIMATE_SYSTEM_PROMPT = `You are an expert construction estimator with 20+ years of experience in residential and commercial construction in the United States. Given a project scope description, generate detailed line-item estimates.

Return ONLY valid JSON — an array of line items. Each item must have:
- description: specific work item name
- phase: one of [Demo, Site Work, Foundation, Framing, Roofing, Exterior, Plumbing, Electrical, HVAC, Insulation, Drywall, Finishes, Flooring, Cabinetry, Tile, Painting, Landscaping, Cleanup, General Conditions, Overhead]
- uom: unit of measure (EA, SF, LF, HR, SY, CY, LS, GAL, TON)
- quantity: realistic quantity for the scope described
- unit_cost: realistic US market rate in dollars (not cents)
- markup_pct: suggested markup percentage (typically 15 for labor, 20 for materials, 25 for subcontractors)
- cost_code: CSI MasterFormat division code if applicable (e.g. "03-3000" for cast-in-place concrete)
- rationale: one sentence explaining why this cost

Be specific and practical. Generate 8-20 line items depending on scope complexity. Use current US market pricing.`

function extractJsonArray(text: string): AISuggestedLine[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No JSON array found in AI response')
  return JSON.parse(match[0]) as AISuggestedLine[]
}

export async function generateEstimateLines(
  scopeText: string,
  projectContext?: { project_type?: string; square_footage?: number; location?: string }
): Promise<AISuggestedLine[]> {
  const contextParts: string[] = []
  if (projectContext?.project_type) contextParts.push(`Project type: ${projectContext.project_type}`)
  if (projectContext?.square_footage) contextParts.push(`Square footage: ${projectContext.square_footage}`)
  if (projectContext?.location) contextParts.push(`Location: ${projectContext.location}`)

  const userContent = contextParts.length > 0
    ? `${contextParts.join('. ')}.\n\nScope: ${scopeText}`
    : scopeText

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: ESTIMATE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')

  try {
    return JSON.parse(block.text) as AISuggestedLine[]
  } catch {
    return extractJsonArray(block.text)
  }
}

// ─── Comp-anchored estimate generation ────────────────────────────────────────
// Rather than pricing from general market knowledge, this builds an estimate from the
// line items of past jobs the estimator picked as comparable. Every line is expected to
// come back tagged with where its number came from, so the reviewer can tell grounded
// lines from inferred ones.

export interface CompLine {
  cost_code:     string | null
  division_num:  string | null
  division_name: string | null
  cost_type:     string | null
  area:          string | null
  description:   string
  uom:           string
  quantity:      number
  unit_cost:     number
  markup_pct:    number
}

export interface CompEstimate {
  job_id:      string | null
  job_name:    string
  source_year: string | null
  total_cost:  number
  areas:       string[]
  lines:       CompLine[]
}

export interface GeneratedLine extends AISuggestedLine {
  /** 'comp' when priced from a comparable job, 'market' when the model had to infer. */
  source:        'comp' | 'market'
  /** Name of the comparable job this line was priced from, when source is 'comp'. */
  comp_job_name?: string | null
  cost_type?:     string | null
  area?:          string | null
}

const COMP_SYSTEM_PROMPT = `You are an estimator for a residential remodeling company. You build new estimates by reusing the company's own historical pricing.

You will be given a project scope and the full line items of one or more comparable past jobs this company actually estimated.

Rules:
1. Build the new estimate primarily from the comparable line items. Reuse their cost_code, description, uom, unit_cost and markup_pct verbatim unless the scope clearly calls for something different.
2. Adjust quantity to fit the new scope. Quantities are the thing that should change between jobs; unit costs should not, unless the scope demands a different specification.
3. Where a cost code appears in several comps at different unit costs, use the most recent one.
4. Only invent a line when the scope needs work that no comp covers. Mark those lines source:"market" and price them at realistic US rates.
5. Every line taken from a comp must be source:"comp" with comp_job_name set to that job's name.
6. Preserve the company's structure: keep the same cost_code, split lines by cost_type ("labor", "materials", "subcontract") the way the comps do, and set area to the room the work belongs to.

Return ONLY a valid JSON array. Each item must have:
- description: the work item
- phase: one of [Demo, Site Work, Foundation, Framing, Roofing, Exterior, Plumbing, Electrical, HVAC, Insulation, Drywall, Finishes, Flooring, Cabinetry, Tile, Painting, Landscaping, Cleanup, General Conditions, Overhead]
- cost_code: the company's code (e.g. "14.1320.010"), or null if inventing a line
- cost_type: "labor" | "materials" | "subcontract" | null
- area: the room or area (e.g. "Bath 1"), or null
- uom, quantity, unit_cost, markup_pct
- source: "comp" or "market"
- comp_job_name: the comp job name when source is "comp", otherwise null
- rationale: one sentence. For comp lines, say which job and quantity reasoning. For market lines, say why no comp covered it.`

function renderComp(comp: CompEstimate, index: number): string {
  const header = [
    `### Comp ${index + 1}: ${comp.job_name}`,
    comp.source_year ? `Year: ${comp.source_year}` : null,
    `Total: $${comp.total_cost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    comp.areas.length > 0 ? `Areas: ${comp.areas.join(', ')}` : null,
  ].filter(Boolean).join(' | ')

  const lines = comp.lines.map(l =>
    [
      l.cost_code ?? '—',
      l.cost_type ?? '—',
      l.area ?? '—',
      l.description,
      `${l.quantity} ${l.uom}`,
      `@ $${l.unit_cost}`,
      `mk ${l.markup_pct}%`,
    ].join(' | ')
  ).join('\n')

  return `${header}\ncost_code | type | area | description | qty | unit cost | markup\n${lines}`
}

export async function generateEstimateFromComps(
  scopeText: string,
  comps: CompEstimate[],
  projectContext?: { project_type?: string; square_footage?: number; location?: string }
): Promise<GeneratedLine[]> {
  if (comps.length === 0) {
    throw new Error('At least one comparable job is required')
  }

  const contextParts: string[] = []
  if (projectContext?.project_type)   contextParts.push(`Project type: ${projectContext.project_type}`)
  if (projectContext?.square_footage) contextParts.push(`Square footage: ${projectContext.square_footage}`)
  if (projectContext?.location)       contextParts.push(`Location: ${projectContext.location}`)

  const userContent = [
    contextParts.length > 0 ? `${contextParts.join('. ')}.` : null,
    `## New project scope\n${scopeText}`,
    `## Comparable past jobs\n${comps.map(renderComp).join('\n\n')}`,
  ].filter(Boolean).join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: COMP_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')

  let raw: unknown
  try {
    raw = JSON.parse(block.text)
  } catch {
    raw = extractJsonArray(block.text)
  }

  if (!Array.isArray(raw)) throw new Error('AI response was not a JSON array')
  return raw.map(normalizeGeneratedLine).filter((l): l is GeneratedLine => l !== null)
}

const VALID_UOM = new Set(['EA', 'SF', 'LF', 'HR', 'SY', 'CY', 'LS', 'GAL', 'TON', 'SET', 'DAY', 'WK'])

/**
 * Coerces one model-produced line into a safe row. The model is prompted for a shape but
 * not bound to it, and these values flow into numeric DB columns — a missing or non-numeric
 * field must not become NaN downstream.
 */
function normalizeGeneratedLine(value: unknown): GeneratedLine | null {
  if (typeof value !== 'object' || value === null) return null
  const l = value as Record<string, unknown>

  const description = typeof l.description === 'string' ? l.description.trim() : ''
  if (!description) return null

  const uomRaw = typeof l.uom === 'string' ? l.uom.trim().toUpperCase() : ''
  const source = l.source === 'comp' ? 'comp' : 'market'

  return {
    description,
    phase:         typeof l.phase === 'string' && l.phase.trim() ? l.phase.trim() : 'General Conditions',
    cost_code:     typeof l.cost_code === 'string' && l.cost_code.trim() ? l.cost_code.trim() : undefined,
    cost_type:     typeof l.cost_type === 'string' && l.cost_type.trim() ? l.cost_type.trim() : null,
    area:          typeof l.area === 'string' && l.area.trim() ? l.area.trim() : null,
    uom:           VALID_UOM.has(uomRaw) ? uomRaw : 'EA',
    quantity:      finiteNumber(l.quantity, 1),
    unit_cost:     finiteNumber(l.unit_cost, 0),
    markup_pct:    finiteNumber(l.markup_pct, 0),
    source,
    comp_job_name: source === 'comp' && typeof l.comp_job_name === 'string' ? l.comp_job_name : null,
    rationale:     typeof l.rationale === 'string' ? l.rationale : undefined,
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : fallback
}
