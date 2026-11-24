import type { SupabaseClient } from '@supabase/supabase-js'

/** Resolve a public share token to its job id, or null if the link is unknown/revoked. */
export async function jobIdForShareToken(admin: SupabaseClient, token: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data } = await admin.from('selection_share_links').select('job_id').eq('token', token).maybeSingle()
  return data?.job_id ?? null
}

export interface ShareComment {
  id: string
  selection_id: string | null
  author_type: 'client' | 'staff'
  author_name: string
  body: string
  created_at: string
}

export const COMMENT_COLUMNS = 'id, selection_id, author_type, author_name, body, created_at'
