import { createAdminClient } from '@/lib/supabase/admin'
import { jobIdForShareToken } from '@/lib/selections/share'
import { SharedShell } from './SharedShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Selections', robots: { index: false, follow: false } }

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

const STATUS: Record<string, string> = { pending: 'Pending', selected: 'Selected', ordered: 'Ordered', installed: 'Installed' }

interface Choice {
  id: string; title: string; details: string | null; product_url: string | null
  client_price: number; is_selected: boolean; vendor: { name: string } | null
}
interface Sel {
  id: string; title: string; location: string | null; status: string
  instructions: string | null; deadline: string | null; choices: Choice[]
}

/** Public, read-only view of a job's selections (token link, no login) with a comment panel. */
export default async function SharedSelectionsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const jobId = await jobIdForShareToken(admin, token)

  if (!jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-600">
        This link is no longer active. Please ask JDC Construction for a new one.
      </div>
    )
  }

  const [{ data: job }, { data: rows }] = await Promise.all([
    admin.from('jobs').select('name, client_name, site_address, city, state').eq('id', jobId).single(),
    // builder_cost is deliberately not selected: this page is for the client.
    admin.from('selections')
      .select('id, title, location, status, instructions, deadline, choices:selection_choices(id, title, details, product_url, client_price, is_selected, created_at, vendor:vendors(name))')
      .eq('job_id', jobId).order('sort_order').order('created_at'),
  ])

  const selections = ((rows ?? []) as unknown as Sel[]).map(s => ({
    ...s,
    choices: [...(s.choices ?? [])].sort((a, b) => ((a as unknown as { created_at: string }).created_at).localeCompare((b as unknown as { created_at: string }).created_at)),
  }))

  const rooms = new Map<string, Sel[]>()
  for (const s of selections) {
    const key = s.location?.trim() || 'General'
    rooms.set(key, [...(rooms.get(key) ?? []), s])
  }
  const roomList = [...rooms.entries()].sort(([a], [b]) => (a === 'General' ? 1 : b === 'General' ? -1 : a.localeCompare(b)))
  const address = [job?.site_address, job?.city, job?.state].filter(Boolean).join(', ')

  return (
    <SharedShell token={token} selections={selections.map(s => ({ id: s.id, title: s.title }))}>
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-8">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">JDC Construction</p>
        <h1 className="font-display text-2xl font-bold text-navy-900 mt-1">Selections</h1>
        <p className="text-sm text-gray-600 mt-1">
          {[job?.name, job?.client_name, address].filter(Boolean).join(' · ')}
        </p>

        {selections.length === 0 && (
          <p className="mt-8 text-sm text-gray-500">No selections have been added yet.</p>
        )}

        {roomList.map(([room, items]) => (
          <section key={room} className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{room}</h2>
            <div className="space-y-3">
              {items.map(s => (
                <div key={s.id} className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-navy-900">{s.title}</p>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">
                      {STATUS[s.status] ?? s.status}
                    </span>
                  </div>
                  {s.deadline && <p className="text-xs text-gray-500 mt-0.5">Decide by {new Date(s.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>}
                  {s.instructions && <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{s.instructions}</p>}
                  {s.choices.length === 0 ? (
                    <p className="text-xs text-gray-400 mt-2">No options yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {s.choices.map(c => (
                        <li key={c.id} className={`rounded-lg border px-3 py-2 flex justify-between gap-3 ${
                          c.is_selected ? 'border-green-300 bg-green-50' : 'border-border'}`}>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-navy-900">
                              {c.title}
                              {c.is_selected && <span className="ml-2 text-[11px] font-bold text-green-700">SELECTED</span>}
                            </p>
                            {(c.vendor?.name || c.details) && (
                              <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">
                                {[c.vendor?.name, c.details].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {c.product_url && /^https?:\/\//i.test(c.product_url) && (
                              <a href={c.product_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-navy-600 underline">View product</a>
                            )}
                          </div>
                          <p className="text-sm tabular-nums text-navy-900 shrink-0">{Number(c.client_price) ? fmt(Number(c.client_price)) : ''}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SharedShell>
  )
}
