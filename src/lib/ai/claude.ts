import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function summarizeDailyLog(logText: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system:
      'You are a construction project assistant. Summarize the daily log entry below in 2-3 concise sentences for a project manager. Focus on work completed, issues, and anything requiring follow-up.',
    messages: [{ role: 'user', content: logText }],
  })

  const block = message.content[0]
  return block.type === 'text' ? block.text : ''
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
