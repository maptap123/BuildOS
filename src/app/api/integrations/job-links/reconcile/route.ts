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

interface ReconcileResult {
  job_id: string
  job_name: string
  suggestions: {
    provider: string
    external_id: string
    display_name: string
    score: number
    action: 'linked' | 'candidate' | 'ignored'
    applied: boolean
  }[]
  error: string | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: adminPerm } = await admin
    .from('user_permissions')
    .select('can_view')
    .eq('user_id', user.id)
    .eq('module', 'admin')
    .single()

  if (!adminPerm?.can_view) {
    return NextResponse.json({ error: 'Forbidden — admin permission required' }, { status: 403 })
  }

  let body: { dryRun?: boolean; limit?: number; status?: string } = {}
  try {
    body = await req.json()
  } catch {
    // allow empty body
  }

  const dryRun = body.dryRun !== false // default true
  const limit  = Math.min(body.limit ?? 25, 100)
  const status = body.status ?? 'active'

  let jobsQuery = admin.from('jobs').select('id, name, job_number, client_name').limit(limit)
  if (status && status !== 'all') jobsQuery = jobsQuery.eq('status', status)

  const { data: jobs, error: jobsErr } = await jobsQuery
  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 })

  const reconcileResults: ReconcileResult[] = []

  for (const job of (jobs ?? [])) {
    const jobInput: JobMatchInput = {
      id:          job.id,
      job_number:  job.job_number ?? '',
      name:        job.name,
      client_name: job.client_name,
    }

    const result: ReconcileResult = {
      job_id:    job.id,
      job_name:  job.name,
      suggestions: [],
      error: null,
    }

    try {
      // QuickBooks
      const qbCandidates = await searchQuickBooksCustomers(job.name, 10)

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

        const action: 'linked' | 'candidate' = score >= SCORE_AUTO_LINK ? 'linked' : 'candidate'
        let applied = false

        if (!dryRun) {
          await admin.from('job_external_links').upsert(
            {
              job_id:             job.id,
              provider:           'quickbooks',
              external_id:        customer.Id,
              external_parent_id: customer.ParentRef?.value ?? null,
              display_name:       customer.DisplayName,
              link_type:          customer.Job ? 'job' : 'customer',
              status:             action,
              confidence:         score,
              match_reason:       `reconcile: name scoring (${score.toFixed(3)})`,
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
            }).eq('id', job.id)
          }

          applied = true
        }

        result.suggestions.push({
          provider: 'quickbooks',
          external_id: customer.Id,
          display_name: customer.DisplayName,
          score,
          action,
          applied,
        })
      }

      // SharePoint
      const spHits = await searchSharePointDriveItems(job.name, 10)

      for (const hit of spHits) {
        const item = hit.resource
        if (!item.folder) continue

        const parentPath = item.parentReference?.path ?? ''
        const candidate: ExternalMatchCandidate = {
          provider:     'sharepoint',
          external_id:  item.id,
          display_name: item.name,
          external_url: item.webUrl,
          external_path: parentPath ? `${parentPath}/${item.name}` : item.name,
          link_type: 'folder',
          raw_metadata: item as unknown as Record<string, unknown>,
        }

        const score = scoreSharePointCandidate(jobInput, candidate)
        if (score < SCORE_CANDIDATE) continue

        const action: 'linked' | 'candidate' = score >= SCORE_AUTO_LINK ? 'linked' : 'candidate'
        let applied = false

        if (!dryRun) {
          await admin.from('job_external_links').upsert(
            {
              job_id:           job.id,
              provider:         'sharepoint',
              external_id:      item.id,
              display_name:     item.name,
              external_url:     item.webUrl,
              external_path:    candidate.external_path,
              link_type:        'folder',
              status:           action,
              confidence:       score,
              match_reason:     `reconcile: folder name scoring (${score.toFixed(3)})`,
              matched_by:       'system',
              raw_metadata:     item as unknown as Record<string, unknown>,
              last_verified_at: new Date().toISOString(),
            },
            { onConflict: 'job_id,provider,external_id' }
          )

          if (action === 'linked') {
            const driveId = item.parentReference?.driveId ?? null
            await admin.from('jobs').update({
              sharepoint_folder_url:     item.webUrl,
              sharepoint_folder_path:    candidate.external_path,
              sharepoint_drive_item_id:  driveId ? `${driveId}!${item.id}` : item.id,
              documents_sync_status:     'linked',
              documents_last_checked_at: new Date().toISOString(),
              documents_sync_error:      null,
            }).eq('id', job.id)
          }

          applied = true
        }

        result.suggestions.push({
          provider: 'sharepoint',
          external_id: item.id,
          display_name: item.name,
          score,
          action,
          applied,
        })
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
    }

    reconcileResults.push(result)
  }

  return NextResponse.json({
    dryRun,
    jobsProcessed: reconcileResults.length,
    results: reconcileResults,
  })
}
