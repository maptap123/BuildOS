import { createAdminClient } from '@/lib/supabase/admin'

export interface JobClientContact {
  clientName: string | null
  phone: string | null
  /** Where the number came from, so the UI can say so when it's a name match. */
  phoneSource: 'job' | 'linked_contact' | 'name_match' | null
  address: string | null
  cityStateZip: string | null
}

/**
 * Resolve the client's name, number and address for a job.
 *
 * `jobs.client_phone` is empty across the board today and `contacts.job_id`
 * has never been populated by the BuilderTrend import, so the number almost
 * always has to come from matching the address book on the client's name.
 * Order of trust: the job's own field, then a contact actually linked to the
 * job, then an exact name match.
 */
export async function getJobClientContact(
  jobId: string,
): Promise<JobClientContact> {
  const admin = createAdminClient()

  const { data: job } = await admin
    .from('jobs')
    .select('client_name, client_phone, site_address, city, state, postal_code')
    .eq('id', jobId)
    .single()

  if (!job) {
    return { clientName: null, phone: null, phoneSource: null, address: null, cityStateZip: null }
  }

  const cityStateZip =
    [job.city, job.state, job.postal_code].filter(Boolean).join(', ') || null

  const base = {
    clientName: job.client_name ?? null,
    address: job.site_address ?? null,
    cityStateZip,
  }

  const onJob = (job.client_phone ?? '').trim()
  if (onJob) return { ...base, phone: onJob, phoneSource: 'job' }

  // A contact explicitly linked to this job wins over a name match.
  const { data: linked } = await admin
    .from('contacts')
    .select('phone')
    .eq('job_id', jobId)
    .not('phone', 'is', null)
    .order('is_primary', { ascending: false })
    .limit(1)

  const linkedPhone = (linked?.[0]?.phone ?? '').trim()
  if (linkedPhone) return { ...base, phone: linkedPhone, phoneSource: 'linked_contact' }

  if (job.client_name?.trim()) {
    const { data: matches } = await admin
      .from('contacts')
      .select('phone')
      .ilike('full_name', job.client_name.trim())
      .not('phone', 'is', null)
      .limit(1)

    const matchPhone = (matches?.[0]?.phone ?? '').trim()
    if (matchPhone) return { ...base, phone: matchPhone, phoneSource: 'name_match' }
  }

  return { ...base, phone: null, phoneSource: null }
}
