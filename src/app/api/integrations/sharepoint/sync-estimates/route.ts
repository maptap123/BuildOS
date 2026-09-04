import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  listSharePointFolderContents,
  listSharePointFolderContentsByUrl,
  fetchSharePointItemContent,
  type SPDriveItem,
} from '@/lib/integrations/microsoft/sharepointReadOnlyClient'
import {
  parseEstimateWorkbook,
  WorkbookNotAnEstimateError,
} from '@/lib/integrations/microsoft/estimateWorkbookParser'

// POST /api/integrations/sharepoint/sync-estimates
//
// Walks the SharePoint folders of jobs that have been linked, finds estimate workbooks,
// parses them and stores the line items in historical_estimate_lines. Those lines are
// what the AI estimate generator anchors its pricing to.
//
// Body (all optional):
//   { job_ids?: string[], dry_run?: boolean, force?: boolean, limit?: number }
//
//   dry_run  report what would be imported without writing
//   force    re-parse even when the file has not changed since the last sync
//   limit    cap the number of jobs processed in one pass (default 25) so the request
//            stays inside the serverless timeout; call repeatedly to work through a backlog

export const maxDuration = 300

/** Files whose name suggests an estimate. Selection sheets and draw schedules are excluded. */
const ESTIMATE_NAME = /estimate/i
const EXCLUDED_NAME = /selection|draw schedule|checklist|contract|letter|invoice/i

function looksLikeEstimateWorkbook(item: SPDriveItem): boolean {
  if (item.folder) return false
  if (!item.name.toLowerCase().endsWith('.xlsx')) return false
  if (EXCLUDED_NAME.test(item.name)) return false
  return ESTIMATE_NAME.test(item.name)
}

interface FileOutcome {
  file: string
  status: 'imported' | 'skipped_unchanged' | 'quarantined' | 'error'
  lines?: number
  total?: number
  reason?: string
}

interface JobOutcome {
  job_id: string
  job_name: string
  files: FileOutcome[]
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Ingesting historical costs is an admin-level action: it rewrites the pricing basis
  // that every future AI estimate is built on.
  const { data: perm } = await admin
    .from('user_permissions')
    .select('can_edit')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()
  if (!perm?.can_edit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const jobIds: string[] | null = Array.isArray(body.job_ids) && body.job_ids.length > 0 ? body.job_ids : null
  const dryRun = body.dry_run === true
  const force  = body.force === true
  const limit  = Math.min(Number(body.limit) || 25, 100)

  let query = admin
    .from('jobs')
    .select('id, name, sharepoint_drive_item_id, sharepoint_folder_url, sharepoint_folder_path')
    .not('sharepoint_drive_item_id', 'is', null)
    .order('name')
    .limit(limit)

  if (jobIds) query = query.in('id', jobIds)

  const { data: jobs, error: jobsErr } = await query
  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ jobs: [], summary: emptySummary(), message: 'No linked jobs to sync' })
  }

  // Existing records keyed by SharePoint item id, so unchanged files can be skipped.
  const { data: existing } = await admin
    .from('historical_estimates')
    .select('id, item_id, file_modified_at')
  const existingByItem = new Map(
    (existing ?? []).map(r => [r.item_id as string, r as { id: string; file_modified_at: string | null }])
  )

  const results: JobOutcome[] = []

  for (const job of jobs) {
    const outcome: JobOutcome = { job_id: job.id, job_name: job.name, files: [] }
    results.push(outcome)

    let items: SPDriveItem[]
    try {
      items = await listFolder(job)
    } catch (e) {
      outcome.files.push({ file: '(folder)', status: 'error', reason: msg(e) })
      continue
    }

    for (const item of items.filter(looksLikeEstimateWorkbook)) {
      outcome.files.push(
        await syncOneFile({ admin, job, item, existingByItem, dryRun, force })
      )
    }
  }

  return NextResponse.json({
    dry_run: dryRun,
    jobs: results,
    summary: summarize(results),
  })
}

// ─── Per-file ingest ──────────────────────────────────────────────────────────

async function syncOneFile(args: {
  admin: ReturnType<typeof createAdminClient>
  job: { id: string; name: string; sharepoint_folder_path: string | null }
  item: SPDriveItem
  existingByItem: Map<string, { id: string; file_modified_at: string | null }>
  dryRun: boolean
  force: boolean
}): Promise<FileOutcome> {
  const { admin, job, item, existingByItem, dryRun, force } = args

  const prior = existingByItem.get(item.id)
  const modified = item.lastModifiedDateTime ?? null

  if (!force && prior && modified && prior.file_modified_at === modified) {
    return { file: item.name, status: 'skipped_unchanged' }
  }

  const driveId = item.parentReference?.driveId
  if (!driveId) return { file: item.name, status: 'error', reason: 'missing driveId' }

  // Parse
  let parsed
  try {
    const res = await fetchSharePointItemContent(driveId, item.id)
    if (!res.ok) return { file: item.name, status: 'error', reason: `download failed (${res.status})` }
    parsed = parseEstimateWorkbook(Buffer.from(await res.arrayBuffer()))
  } catch (e) {
    if (e instanceof WorkbookNotAnEstimateError) {
      if (!dryRun) await recordQuarantine(admin, job, item, driveId, e.message)
      return { file: item.name, status: 'quarantined', reason: e.message }
    }
    return { file: item.name, status: 'error', reason: msg(e) }
  }

  if (dryRun) {
    return { file: item.name, status: 'imported', lines: parsed.lines.length, total: round2(parsed.totalCost) }
  }

  // Upsert the parent record, then replace its lines. Lines cascade on delete, so
  // re-syncing a changed file cannot leave stale rows behind.
  const { data: saved, error: upsertErr } = await admin
    .from('historical_estimates')
    .upsert({
      job_id:           job.id,
      drive_id:         driveId,
      item_id:          item.id,
      file_name:        item.name,
      web_url:          item.webUrl ?? null,
      folder_path:      job.sharepoint_folder_path ?? null,
      source_year:      yearFromPath(job.sharepoint_folder_path),
      file_modified_at: modified,
      parse_status:     'ok',
      parse_error:      null,
      line_count:       parsed.lines.length,
      total_cost:       round2(parsed.totalCost),
      areas:            parsed.areas,
      divisions:        parsed.divisions,
      fingerprint:      parsed.fingerprint,
      synced_at:        new Date().toISOString(),
    }, { onConflict: 'drive_id,item_id' })
    .select('id')
    .single()

  if (upsertErr || !saved) {
    return { file: item.name, status: 'error', reason: upsertErr?.message ?? 'upsert failed' }
  }

  await admin.from('historical_estimate_lines').delete().eq('historical_estimate_id', saved.id)

  const rows = parsed.lines.map(l => ({
    historical_estimate_id: saved.id,
    job_id:         job.id,
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
    total_cost:     round2(l.total_cost),
    markup_pct:     l.markup_pct,
    internal_notes: l.internal_notes,
  }))

  // Chunked so a large workbook does not exceed the request size limit.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from('historical_estimate_lines').insert(rows.slice(i, i + 500))
    if (error) return { file: item.name, status: 'error', reason: error.message }
  }

  existingByItem.set(item.id, { id: saved.id, file_modified_at: modified })
  return { file: item.name, status: 'imported', lines: rows.length, total: round2(parsed.totalCost) }
}

async function recordQuarantine(
  admin: ReturnType<typeof createAdminClient>,
  job: { id: string; sharepoint_folder_path: string | null },
  item: SPDriveItem,
  driveId: string,
  reason: string
) {
  await admin.from('historical_estimates').upsert({
    job_id:           job.id,
    drive_id:         driveId,
    item_id:          item.id,
    file_name:        item.name,
    web_url:          item.webUrl ?? null,
    folder_path:      job.sharepoint_folder_path ?? null,
    source_year:      yearFromPath(job.sharepoint_folder_path),
    file_modified_at: item.lastModifiedDateTime ?? null,
    parse_status:     'quarantined',
    parse_error:      reason,
    line_count:       0,
    synced_at:        new Date().toISOString(),
  }, { onConflict: 'drive_id,item_id' })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listFolder(job: {
  sharepoint_drive_item_id: string | null
  sharepoint_folder_url: string | null
}): Promise<SPDriveItem[]> {
  if (job.sharepoint_drive_item_id) {
    try {
      return await listSharePointFolderContents(job.sharepoint_drive_item_id)
    } catch {
      // Composite ID can go stale when a folder is moved; fall back to the URL.
    }
  }
  if (job.sharepoint_folder_url) {
    const { items } = await listSharePointFolderContentsByUrl(job.sharepoint_folder_url)
    return items
  }
  throw new Error('job has no SharePoint folder reference')
}

/** "JDC / Jobs / 2025 / Ernst" → "2025" */
function yearFromPath(path: string | null): string | null {
  if (!path) return null
  const match = path.match(/\b(20\d{2})\b/)
  return match ? match[1] : null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function emptySummary() {
  return { imported: 0, lines: 0, skipped_unchanged: 0, quarantined: 0, errors: 0 }
}

function summarize(results: JobOutcome[]) {
  const s = emptySummary()
  for (const job of results) {
    for (const f of job.files) {
      if (f.status === 'imported')          { s.imported++; s.lines += f.lines ?? 0 }
      else if (f.status === 'skipped_unchanged') s.skipped_unchanged++
      else if (f.status === 'quarantined')       s.quarantined++
      else                                        s.errors++
    }
  }
  return s
}
