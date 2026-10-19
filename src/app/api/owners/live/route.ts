import { NextResponse } from 'next/server'
import { ownersAccess } from '@/lib/owners/access'
import { loadLiveCrew } from '@/lib/owners/data'

export const dynamic = 'force-dynamic'

// Who is on the clock right now — polled by the Owners View every 30s.
export async function GET() {
  const access = await ownersAccess()
  if (access === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access === false) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json({ shifts: await loadLiveCrew(), at: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load crew' }, { status: 500 })
  }
}
