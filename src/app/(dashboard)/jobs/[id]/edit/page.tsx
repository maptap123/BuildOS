'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, X, Archive, Trash2, AlertTriangle } from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { useTagOptions } from '@/hooks/useTagOptions'
import type { Job, JobStatus } from '@/types'

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'lead',     label: 'Lead'     },
  { value: 'presale',  label: 'Presale'  },
  { value: 'active',   label: 'Active'   },
  { value: 'closed',   label: 'Closed'   },
  { value: 'archived', label: 'Archived' },
]

type Tab = 'details' | 'client'

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
    />
  )
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      rows={props.rows ?? 3}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent placeholder-gray-400 resize-none"
    />
  )
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className="w-full border border-border rounded-lg px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
    >
      {children}
    </select>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display font-semibold text-navy-900 text-sm border-b border-border pb-2 mb-4">
      {children}
    </h3>
  )
}

export default function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('details')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<JobStatus>('active')
  const [contractAmount, setContractAmount] = useState('')
  const [estimatedCost, setEstimatedCost] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [siteAddress, setSiteAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [actualDate, setActualDate] = useState('')
  const [pmId, setPmId] = useState('')
  const [superId, setSuperId] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')

  const { users } = useUsers()
  const { tags: tagOptions } = useTagOptions()

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then(r => r.json())
      .then((j: Job) => {
        setJob(j)
        setName(j.name ?? '')
        setDescription(j.description ?? '')
        setStatus(j.status)
        setContractAmount(j.contract_amount?.toString() ?? '')
        setEstimatedCost(j.estimated_cost?.toString() ?? '')
        setSelectedTags(j.tags ?? [])
        setSiteAddress(j.site_address ?? '')
        setCity(j.city ?? '')
        setState(j.state ?? '')
        setPostalCode(j.postal_code ?? '')
        setStartDate(j.start_date ?? '')
        setTargetDate(j.target_completion_date ?? '')
        setActualDate(j.actual_completion_date ?? '')
        setPmId(j.project_manager_id ?? '')
        setSuperId(j.superintendent_id ?? '')
        setClientName(j.client_name ?? '')
        setClientEmail(j.client_email ?? '')
        setClientPhone(j.client_phone ?? '')
      })
      .catch(() => setError('Failed to load job'))
      .finally(() => setLoading(false))
  }, [id])

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  async function handleArchive() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Archive failed')
      }
      router.push('/jobs')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
      if (res.status === 204) {
        router.push('/jobs')
        router.refresh()
        return
      }
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Delete failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Job name is required'); return }
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
          contract_amount: contractAmount ? parseFloat(contractAmount) : null,
          estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
          tags: selectedTags,
          site_address: siteAddress.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          postal_code: postalCode.trim() || null,
          start_date: startDate || null,
          target_completion_date: targetDate || null,
          actual_completion_date: actualDate || null,
          project_manager_id: pmId || null,
          superintendent_id: superId || null,
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          client_phone: clientPhone.trim() || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Save failed')
      }

      router.push(`/jobs/${id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    )
  }

  if (!job) {
    return <div className="text-red-500 text-sm">{error ?? 'Job not found'}</div>
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'details', label: 'Job Details' },
    { key: 'client',  label: 'Client'      },
  ]

  return (
    <div className="max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push(`/jobs/${id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-navy-700 transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-500 font-medium">{error}</span>
          )}
          <button
            onClick={() => router.push(`/jobs/${id}`)}
            className="px-4 py-2 text-sm font-semibold text-gray-600 border border-border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-navy-900 hover:bg-navy-800 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            <Save size={15} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-gold-500 text-navy-900'
                : 'border-transparent text-gray-500 hover:text-navy-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Job Details ── */}
      {activeTab === 'details' && (
        <div className="space-y-8">

          {/* Job Information */}
          <div>
            <SectionHeader>Job Information</SectionHeader>
            <div className="grid grid-cols-1 gap-4">

              <Field>
                <Label required>Job Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bryant Bathroom Renovation" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>Status</Label>
                  <Select value={status} onChange={e => setStatus(e.target.value as JobStatus)}>
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>Contract Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={contractAmount}
                      onChange={e => setContractAmount(e.target.value)}
                      placeholder="0.00"
                      className="pl-7"
                      style={{ paddingLeft: '1.75rem' }}
                    />
                  </div>
                </Field>
                <Field>
                  <Label>Estimated Cost</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={estimatedCost}
                      onChange={e => setEstimatedCost(e.target.value)}
                      placeholder="0.00"
                      style={{ paddingLeft: '1.75rem' }}
                    />
                  </div>
                </Field>
              </div>

              {tagOptions.length > 0 && (
                <Field>
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-1.5 p-2 border border-border rounded-lg bg-white min-h-[40px]">
                    {tagOptions.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.name)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedTags.includes(t.name)
                            ? 'bg-navy-900 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t.name}
                        {selectedTags.includes(t.name) && <X size={10} />}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              <Field>
                <Label>Description / Notes</Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Internal notes about this job…"
                  rows={4}
                />
              </Field>

            </div>
          </div>

          {/* Address */}
          <div>
            <SectionHeader>Address</SectionHeader>
            <div className="grid grid-cols-1 gap-4">
              <Field>
                <Label>Street Address</Label>
                <Input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} placeholder="123 Main St" />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <Field>
                    <Label>City</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Nashville" />
                  </Field>
                </div>
                <Field>
                  <Label>State</Label>
                  <Input value={state} onChange={e => setState(e.target.value)} placeholder="TN" maxLength={2} />
                </Field>
                <Field>
                  <Label>Zip Code</Label>
                  <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="37201" />
                </Field>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div>
            <SectionHeader>Schedule</SectionHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </Field>
              <Field>
                <Label>Target Completion</Label>
                <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
              </Field>
              <Field>
                <Label>Actual Completion</Label>
                <Input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Team */}
          {users.length > 0 && (
            <div>
              <SectionHeader>Team</SectionHeader>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>Project Manager</Label>
                  <Select value={pmId} onChange={e => setPmId(e.target.value)}>
                    <option value="">— None —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>Superintendent</Label>
                  <Select value={superId} onChange={e => setSuperId(e.target.value)}>
                    <option value="">— None —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Tab: Client ── */}
      {activeTab === 'client' && (
        <div>
          <SectionHeader>Client Contact</SectionHeader>
          <div className="grid grid-cols-1 gap-4">
            <Field>
              <Label required>Client Name</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Kim Bryant" />
            </Field>
            <Field>
              <Label>Email</Label>
              <Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" />
            </Field>
            <Field>
              <Label>Phone</Label>
              <Input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(615) 555-0100" />
            </Field>
          </div>
        </div>
      )}

      {/* ── Danger Zone ── */}
      <div className="mt-12 pt-6 border-t border-red-100">
        <h3 className="font-display font-semibold text-red-600 text-sm mb-4 flex items-center gap-1.5">
          <AlertTriangle size={14} />
          Danger Zone
        </h3>
        <div className="space-y-3">
          {job.status !== 'archived' && (
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-gray-50">
              <div>
                <p className="text-sm font-medium text-navy-900">Archive this job</p>
                <p className="text-xs text-gray-500 mt-0.5">Hides the job from the active list. Can be restored by changing the status.</p>
              </div>
              <button
                onClick={handleArchive}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 border border-border rounded-lg hover:bg-white transition-colors shrink-0 disabled:opacity-50"
              >
                <Archive size={13} />
                Archive
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-red-200 bg-red-50">
            <div>
              <p className="text-sm font-medium text-red-700">Delete this job</p>
              <p className="text-xs text-red-500 mt-0.5">Permanently removes this job. Only works if the job has no related records.</p>
            </div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors shrink-0"
              >
                <Trash2 size={13} />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-border rounded-lg hover:bg-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
