import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  scoreQuickBooksCandidate,
  scoreSharePointCandidate,
  type JobMatchInput,
  type ExternalMatchCandidate,
} from '@/lib/integrations/jobMatching'
import { searchQuickBooksCustomers } from '@/lib/integrations/quickbooks/readOnlyClient'
import { searchSharePointDriveItems } from '@/lib/integrations/microsoft/sharepointReadOnlyClient'

const SCORE_AUTO_LINK = 0.90
const SCORE_CANDIDATE = 0.70

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const [{ data: jobPerm }, { data: adminPerm }] = await Promise.all([
    admin.from('user_permissions').select('can_edit').eq('user_id', user.id).eq('module', 'jobs').single(),
    admin.from('user_permissions').select('can_view').eq('user_id', user.id).eq('module', 'admin').single(),
  ])

  if (!jobPerm?.can_edit && !adminPerm?.can_view) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .select('id, name, job_number, client_name')
    .eq('id', id)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const jobInput: JobMatchInput = {
    id: job.id,
    job_number: job.job_number ?? '',
    name: job.name,
    client_name: job.client_name,
  }

  const results: {
    provider: string
    display_name: string
    score: number
    action: 'linked' | 'candidate' | 'ignored'
    external_id: string
  }[] = []

  // ─── QuickBooks search ─────────────────────────────────────────────────────

  let qbError: string | null = null
  try {
    const qbCandidates = await searchQuickBooksCustomers(job.name, 20)
    if (job.client_name) {
      const lastName = job.client_name.split(' ').pop() ?? ''
      if (lastName && lastName !== job.name) {
        const byClient = await searchQuickBooksCustomers(lastName, 10)
        for (const c of byClient) {
          if (!qbCandidates.find(x => x.Id === c.Id)) qbCandidates.push(c)
        }
      }
    }

    for (const customer of qbCandidates) {
      const candidate: ExternalMatchCandidate = {
        provider:    'quickbooks',
        external_id: customer.Id,
        external_parent_id: customer.ParentRef?.value,
        display_name: customer.DisplayName,
        link_type: customer.Job ? 'job' : 'customer',
        raw_metadata: customer as unknown as Record<string, unknown>,
      }

      const score = scoreQuickBooksCandidate(jobInput, candidate)
      if (score < SCORE_CANDIDATE) continue

      const action = score >= SCORE_AUTO_LINK ? 'linked' : 'candidate'

      await admin.from('job_external_links').upsert(
        {
          job_id:             id,
          provider:           'quickbooks',
          external_id:        customer.Id,
          external_parent_id: customer.ParentRef?.value ?? null,
          display_name:       customer.DisplayName,
          link_type:          customer.Job ? 'job' : 'customer',
          status:             action,
          confidence:         score,
          match_reason:       `auto-match: name scoring (${score.toFixed(3)})`,
          matched_by:         'system',
          raw_metadata:       customer as unknown as Record<string, unknown>,
          last_verified_at:   new Date().toISOString(),
        },
        { onConflict: 'job_id,provider,external_id' }
      )

      if (action === 'linked') {
        await admin.from('jobs').update({
          qb_customer_id: customer.Id,
          qb_project_id: customer.Job ? customer.Id : null,
          qb_sync_status: 'synced',
          qb_last_synced_at: new Date().toISOString(),
          qb_sync_error: null,
        }).eq('id', id)
      }

      results.push({ provider: 'quickbooks', display_name: customer.DisplayName, score, action, external_id: customer.Id })
    }
  } catch (err) {
    qbError = err instanceof Error ? err.message : String(err)
  }

  // ─── SharePoint search ─────────────────────────────────────────────────────

  let spError: string | null = null
  let spLinked = false

  try {
    const spHits = await searchSharePointDriveItems(job.name, 25)

    for (const hit of spHits) {
      const item = hit.resource
      if (!item.folder) continue // folders only

      const parentPath = item.parentReference?.path ?? ''
      const candidate: ExternalMatchCandidate = {
        provider:    'sharepoint',
        external_id: item.id,
        display_name: item.name,
        external_url: item.webUrl,
        external_path: parentPath ? `${parentPath}/${item.name}` : item.name,
        link_type: 'folder',
        raw_metadata: item as unknown as Record<string, unknown>,
      }

      const score = scoreSharePointCandidate(jobInput, candidate)
      if (score < SCORE_CANDIDATE) continue

      const action = score >= SCORE_AUTO_LINK ? 'linked' : 'candidate'

      await admin.from('job_external_links').upsert(
        {
          job_id:           id,
          provider:         'sharepoint',
          external_id:      item.id,
          display_name:     item.name,
          external_url:     item.webUrl,
          external_path:    candidate.external_path,
          link_type:        'folder',
          status:           action,
          confidence:       score,
          match_reason:     `auto-match: folder name scoring (${score.toFixed(3)})`,
          matched_by:       'system',
          raw_metadata:     item as unknown as Record<string, unknown>,
          last_verified_at: new Date().toISOString(),
        },
        { onConflict: 'job_id,provider,external_id' }
      )

      if (action === 'linked' && !spLinked) {
        const driveId = item.parentReference?.driveId ?? null
        await admin.from('jobs').update({
          sharepoint_folder_url:     item.webUrl,
          sharepoint_folder_path:    candidate.external_path,
          sharepoint_drive_item_id:  driveId ? `${driveId}!${item.id}` : item.id,
          documents_sync_status:     'linked',
          documents_last_checked_at: new Date().toISOString(),
          documents_sync_error:      null,
        }).eq('id', id)
        spLinked = true
      }

      results.push({ provider: 'sharepoint', display_name: item.name, score, action, external_id: item.id })
    }

    await admin.from('jobs').update({
      documents_last_checked_at: new Date().toISOString(),
      ...(spLinked ? {} : { documents_sync_status: results.some(r => r.provider === 'sharepoint') ? 'candidate' : 'not_linked' }),
    }).eq('id', id)

  } catch (err) {
    spError = err instanceof Error ? err.message : String(err)
    await admin.from('jobs').update({
      documents_sync_status:     'error',
      documents_sync_error:      spError,
      documents_last_checked_at: new Date().toISOString(),
    }).eq('id', id)
  }

  return NextResponse.json({
    results,
    errors: {
      quickbooks: qbError,
      sharepoint: spError,
    },
  })
}
