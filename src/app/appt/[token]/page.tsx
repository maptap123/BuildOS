import { createAdminClient } from '@/lib/supabase/admin'
import { CalendarDays, CheckCircle2, HardHat, MapPin, XCircle } from 'lucide-react'
import {
  formatDateRange,
  googleCalendarUrl,
  jobAddress,
  loadAssignmentByToken,
} from '@/lib/schedule/assignments'
import { AppointmentActions } from './AppointmentActions'

// Public, token-authenticated page. This is the link Fixer texts a sub — it is
// opened on a phone, with no login, usually one-handed on a job site.

export const dynamic = 'force-dynamic'

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const ctx = await loadAssignmentByToken(createAdminClient(), token)

  if (!ctx) {
    return (
      <Shell>
        <div className="text-center py-12">
          <XCircle size={40} className="mx-auto text-gray-300 mb-3" />
          <h1 className="text-lg font-semibold text-navy-900">Appointment not found</h1>
          <p className="text-sm text-gray-500 mt-1">
            This link may have expired. Text us back and we&apos;ll send a new one.
          </p>
        </div>
      </Shell>
    )
  }

  const { assignment, item, job } = ctx
  const cancelled = assignment.status === 'cancelled'

  return (
    <Shell>
      <div className="text-center mb-6">
        <p className="text-[11px] font-semibold text-gold-600 uppercase tracking-widest">
          JDC Construction
        </p>
        <h1 className="font-display text-xl font-semibold text-navy-900 mt-1">
          {cancelled ? 'This job is no longer scheduled' : `Hi ${assignment.contact_name.split(' ')[0]}`}
        </h1>
        {!cancelled && (
          <p className="text-sm text-gray-500 mt-1">
            {assignment.status === 'confirmed'
              ? "You're confirmed for this one."
              : assignment.status === 'declined'
                ? 'You let us know this one does not work for you.'
                : 'Can you make this one?'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <div className="flex items-start gap-3">
            <HardHat size={18} className="text-gold-500 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-semibold text-navy-900 leading-snug">{item.title}</h2>
              {item.trade && <p className="text-xs text-gray-400 mt-0.5">{item.trade}</p>}
            </div>
          </div>
        </div>

        <dl className="divide-y divide-gray-50">
          <Row icon={<CalendarDays size={16} />} label="When">
            {formatDateRange(item.start_date, item.end_date)}
          </Row>
          <Row icon={<MapPin size={16} />} label="Where">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(jobAddress(job))}`}
              target="_blank"
              rel="noreferrer"
              className="text-navy-700 underline decoration-gray-300 underline-offset-2"
            >
              {jobAddress(job)}
            </a>
            <span className="block text-xs text-gray-400 mt-0.5">
              {job.job_number} · {job.name}
            </span>
          </Row>
          {item.description && (
            <Row icon={<CheckCircle2 size={16} />} label="Scope">
              {item.description}
            </Row>
          )}
        </dl>
      </div>

      {!cancelled && (
        <AppointmentActions
          token={token}
          initialStatus={assignment.status}
          icsUrl={`/api/appt/${token}/ics`}
          googleUrl={googleCalendarUrl(ctx)}
        />
      )}

      <p className="text-center text-xs text-gray-400 mt-8">
        Questions? Just reply to our text — Fixer will get you an answer.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="px-5 py-3.5 flex gap-3">
      <span className="text-gray-300 shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</dt>
        <dd className="text-sm text-navy-800 mt-0.5 break-words">{children}</dd>
      </div>
    </div>
  )
}
