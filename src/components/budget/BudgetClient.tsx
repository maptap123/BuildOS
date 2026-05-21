'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { AlertCircle, RefreshCw, CheckCircle2, AlertTriangle, Clock, CloudUpload, ClipboardList, Download } from 'lucide-react'
import { useBudget } from '@/hooks/useBudget'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { BudgetSummary } from './BudgetSummary'
import { BudgetLineTable } from './BudgetLineTable'
import { AddBudgetLineModal } from './AddBudgetLineModal'
import { AddActualModal } from './AddActualModal'
import { ChangeOrderTable } from './ChangeOrderTable'
import { AddChangeOrderModal } from './AddChangeOrderModal'
import { BillsTable } from './BillsTable'
import { PurchaseOrderTable } from './PurchaseOrderTable'
import { AddPOModal } from './AddPOModal'
import { BillingMilestonesTable } from './BillingMilestonesTable'
import { WorkOrderTable } from './WorkOrderTable'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import { useBillingMilestones } from '@/hooks/useBillingMilestones'
import { useWorkOrders } from '@/hooks/useWorkOrders'
import type { Job, BudgetLine, Actual, ChangeOrder, PurchaseOrder, QBSyncStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  job: Pick<Job, 'id' | 'contract_amount' | 'estimated_cost' | 'qb_sync_status' | 'qb_last_synced_at' | 'qb_customer_id'>
  leadId?: string
  initialLines: BudgetLine[]
  initialActuals: Actual[]
  initialChangeOrders: ChangeOrder[]
  permissions: Permissions
  currentUserId: string
}

type Tab = 'budget' | 'change_orders' | 'bills' | 'purchase_orders' | 'work_orders' | 'billing'

const QB_STATUS: Record<QBSyncStatus, { icon: React.ReactNode; text: string; color: string }> = {
  not_synced: { icon: <Clock size={12} />,       text: 'Not synced to QuickBooks', color: 'text-gray-400'    },
  pending:    { icon: <RefreshCw size={12} className="animate-spin" />, text: 'Syncing…', color: 'text-blue-500' },
  synced:     { icon: <CheckCircle2 size={12} />, text: 'Synced to QuickBooks',     color: 'text-green-600'   },
  error:      { icon: <AlertTriangle size={12} />,text: 'Sync error',               color: 'text-red-500'     },
}

function QBSyncBadge({ status, lastSynced }: { status: QBSyncStatus; lastSynced: string | null }) {
  const cfg = QB_STATUS[status]
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      <span>{cfg.text}</span>
      {status === 'synced' && lastSynced && (
        <span className="text-gray-400 font-normal">
          · {new Date(lastSynced).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
        </span>
      )}
    </div>
  )
}

export function BudgetClient({
  jobId, job, leadId, initialLines, initialActuals, initialChangeOrders, permissions, currentUserId
}: Props) {
  const { lines, actuals, loading: budgetLoading, error: budgetError, refresh: refreshBudget } = useBudget(jobId, initialLines, initialActuals)
  const { orders, loading: coLoading, error: coError, refresh: refreshCOs } = useChangeOrders(jobId, initialChangeOrders)
  const { pos, loading: poLoading, error: poError, refresh: refreshPOs } = usePurchaseOrders(jobId)
  const { workOrders, loading: woLoading, error: woError, refresh: refreshWOs } = useWorkOrders(jobId)
  const { milestones, loading: billingLoading, error: billingError, refresh: refreshMilestones } = useBillingMilestones(jobId)

  const [tab, setTab] = useState<Tab>('budget')
  const [qbSyncing, setQbSyncing] = useState(false)
  const [qbError, setQbError] = useState<string | null>(null)

  const handleSyncToQB = useCallback(async () => {
    setQbSyncing(true)
    setQbError(null)
    try {
      const res = await fetch('/api/integrations/quickbooks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'job', id: jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setQbError(data.error ?? 'QuickBooks sync failed')
      } else {
        // Refresh job data by reloading the page section
        window.location.reload()
      }
    } catch {
      setQbError('Network error — could not reach QuickBooks sync endpoint')
    } finally {
      setQbSyncing(false)
    }
  }, [jobId])

  function exportBudgetCSV() {
    const today = new Date().toISOString().slice(0, 10)
    const headers = ['Phase', 'Cost Code', 'Category', 'Description', 'Status', 'Original Budget', 'Revised Budget', 'Committed Cost', 'Forecast Cost', 'Variance']
    const rows = lines.map(l => {
      const forecast = l.forecast_cost ?? l.revised_budget
      return [
        l.phase ?? '',
        l.cost_code,
        l.category,
        l.description,
        l.status,
        l.original_budget,
        l.revised_budget,
        l.committed_cost,
        forecast,
        l.revised_budget - forecast,
      ]
    })
    const totalForecast = lines.reduce((s, l) => s + (l.forecast_cost ?? l.revised_budget), 0)
    const totals = [
      'TOTALS', '', '', '', '',
      lines.reduce((s, l) => s + l.original_budget, 0),
      lines.reduce((s, l) => s + l.revised_budget, 0),
      lines.reduce((s, l) => s + l.committed_cost, 0),
      totalForecast,
      lines.reduce((s, l) => s + l.revised_budget, 0) - totalForecast,
    ]
    const csv = [headers, ...rows, totals]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    const a = document.createElement('a')
    a.href = url
    a.download = `budget-${jobId}-${today}.csv`
    a.click()
  }

  function exportBillsCSV() {
    const today = new Date().toISOString().slice(0, 10)
    const lineMap = new Map(lines.map(l => [l.id, l]))
    const headers = ['Date', 'Vendor', 'Invoice #', 'Description', 'Budget Line', 'Amount', 'Status']
    const rows = actuals.map(a => {
      const bl = a.budget_line_id ? lineMap.get(a.budget_line_id) : undefined
      return [
        a.incurred_date,
        a.vendor_name ?? '',
        a.invoice_number ?? '',
        a.description,
        bl ? `${bl.cost_code} · ${bl.description}` : '',
        a.amount,
        a.status,
      ]
    })
    const total = ['TOTALS', '', '', '', '', actuals.reduce((s, a) => s + a.amount, 0), '']
    const csv = [headers, ...rows, total]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    const a = document.createElement('a')
    a.href = url
    a.download = `bills-${jobId}-${today}.csv`
    a.click()
  }

  const [showAddLine, setShowAddLine]           = useState(false)
  const [editLine, setEditLine]                 = useState<BudgetLine | null>(null)
  const [addActualForLine, setAddActualForLine] = useState<string | null>(null)
  const [showAddBill, setShowAddBill]           = useState(false)
  const [showAddCO, setShowAddCO]               = useState(false)
  const [editCO, setEditCO]                     = useState<ChangeOrder | null>(null)
  const [showAddPO, setShowAddPO]               = useState(false)
  const [editPO, setEditPO]                     = useState<PurchaseOrder | null>(null)

  const loading = tab === 'budget' ? budgetLoading : tab === 'change_orders' ? coLoading : tab === 'purchase_orders' ? poLoading : tab === 'work_orders' ? woLoading : tab === 'billing' ? billingLoading : false
  const error   = tab === 'budget' ? budgetError   : tab === 'change_orders' ? coError   : tab === 'purchase_orders' ? poError   : tab === 'work_orders' ? woError   : tab === 'billing' ? billingError   : null

  const approvedCOTotal = orders
    .filter(co => co.status === 'approved')
    .reduce((s, co) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0)

  const actualsTotal = actuals
    .filter(a => a.status === 'approved' || a.status === 'paid')
    .reduce((s, a) => s + a.amount, 0)

  return (
    <div className="space-y-5">

      {/* QB sync status bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <QBSyncBadge status={job.qb_sync_status} lastSynced={job.qb_last_synced_at} />
          {job.qb_sync_status !== 'not_synced' && job.qb_customer_id && (
            <span className="text-xs text-gray-400">
              QB Customer: {job.qb_customer_id}
            </span>
          )}
        </div>
        {permissions.can_edit && (
          <button
            onClick={handleSyncToQB}
            disabled={qbSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {qbSyncing
              ? <RefreshCw size={12} className="animate-spin" />
              : <CloudUpload size={12} />
            }
            {qbSyncing ? 'Syncing…' : 'Sync to QuickBooks'}
          </button>
        )}
      </div>
      {qbError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0" />
          {qbError}
        </div>
      )}

      <BudgetSummary job={job} lines={lines} approvedCOTotal={approvedCOTotal} actualsTotal={actualsTotal} />

      {/* Tab switcher */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab('budget')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'budget' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Budget Lines
          <span className={`ml-2 text-[11px] ${tab === 'budget' ? 'text-white/70' : 'text-gray-400'}`}>{lines.length}</span>
        </button>
        <button
          onClick={() => setTab('change_orders')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'change_orders' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Change Orders
          <span className={`ml-2 text-[11px] ${tab === 'change_orders' ? 'text-white/70' : 'text-gray-400'}`}>{orders.length}</span>
        </button>
        <button
          onClick={() => setTab('bills')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'bills' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Bills
          <span className={`ml-2 text-[11px] ${tab === 'bills' ? 'text-white/70' : 'text-gray-400'}`}>{actuals.length}</span>
        </button>
        <button
          onClick={() => setTab('purchase_orders')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'purchase_orders' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Purchase Orders
          <span className={`ml-2 text-[11px] ${tab === 'purchase_orders' ? 'text-white/70' : 'text-gray-400'}`}>{pos.length}</span>
        </button>
        <button
          onClick={() => setTab('work_orders')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'work_orders' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Work Orders
          <span className={`ml-2 text-[11px] ${tab === 'work_orders' ? 'text-white/70' : 'text-gray-400'}`}>{workOrders.length}</span>
        </button>
        <button
          onClick={() => setTab('billing')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'billing' ? 'bg-navy-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          Draw Schedule
          <span className={`ml-2 text-[11px] ${tab === 'billing' ? 'text-white/70' : 'text-gray-400'}`}>{milestones.length}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
          Loading {tab === 'budget' ? 'budget' : tab === 'change_orders' ? 'change orders' : tab === 'purchase_orders' ? 'purchase orders' : tab === 'work_orders' ? 'work orders' : tab === 'billing' ? 'draw schedule' : 'bills'}…
        </div>
      ) : tab === 'budget' ? (
        <>
          {lines.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={exportBudgetCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          )}
          {lines.length === 0 && leadId && (
            <div className="flex items-center justify-between bg-navy-50 border border-navy-100 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2.5 text-sm text-navy-700">
                <ClipboardList size={16} className="text-navy-400 shrink-0" />
                <span>This job has an estimate — import it as budget lines.</span>
              </div>
              <Link
                href={`/jobs/${jobId}/estimates`}
                className="text-xs font-semibold text-gold-600 hover:text-gold-700 transition-colors shrink-0 ml-4"
              >
                View Estimates →
              </Link>
            </div>
          )}
          <BudgetLineTable
            lines={lines}
            actuals={actuals}
            permissions={permissions}
            onAddLine={() => setShowAddLine(true)}
            onAddActual={lineId => setAddActualForLine(lineId)}
            onEdit={line => setEditLine(line)}
          />
        </>
      ) : tab === 'change_orders' ? (
        <ChangeOrderTable
          changeOrders={orders}
          permissions={permissions}
          jobId={jobId}
          onAdd={() => setShowAddCO(true)}
          onEdit={co => setEditCO(co)}
        />
      ) : tab === 'purchase_orders' ? (
        <PurchaseOrderTable
          pos={pos}
          permissions={permissions}
          onAdd={() => setShowAddPO(true)}
          onEdit={po => setEditPO(po)}
          onDelete={po => {
            if (confirm('Delete this purchase order? This cannot be undone.')) {
              fetch(`/api/purchase-orders?id=${po.id}`, { method: 'DELETE' })
                .then(() => refreshPOs())
                .catch(() => {})
            }
          }}
        />
      ) : tab === 'work_orders' ? (
        <WorkOrderTable
          jobId={jobId}
          workOrders={workOrders}
          lines={lines}
          permissions={permissions}
          onRefresh={refreshWOs}
        />
      ) : tab === 'billing' ? (
        <BillingMilestonesTable
          jobId={jobId}
          milestones={milestones}
          permissions={permissions}
          onRefresh={refreshMilestones}
        />
      ) : (
        <>
          {actuals.length > 0 && (
            <div className="flex justify-end">
              <button
                onClick={exportBillsCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          )}
          <BillsTable
            actuals={actuals}
            lines={lines}
            permissions={permissions}
            currentUserId={currentUserId}
            onAdd={() => setShowAddBill(true)}
            onRefresh={refreshBudget}
          />
        </>
      )}

      {showAddLine && (
        <AddBudgetLineModal
          jobId={jobId}
          onClose={() => setShowAddLine(false)}
          onCreated={() => { setShowAddLine(false); refreshBudget() }}
        />
      )}

      {editLine && (
        <AddBudgetLineModal
          jobId={jobId}
          initialData={editLine}
          onClose={() => setEditLine(null)}
          onCreated={() => { setEditLine(null); refreshBudget() }}
        />
      )}

      {addActualForLine && (
        <AddActualModal
          jobId={jobId}
          budgetLineId={addActualForLine}
          lines={lines}
          onClose={() => setAddActualForLine(null)}
          onCreated={() => { setAddActualForLine(null); refreshBudget() }}
        />
      )}

      {showAddBill && (
        <AddActualModal
          jobId={jobId}
          budgetLineId=""
          lines={lines}
          onClose={() => setShowAddBill(false)}
          onCreated={() => { setShowAddBill(false); refreshBudget() }}
        />
      )}

      {showAddCO && (
        <AddChangeOrderModal
          jobId={jobId}
          lines={lines}
          onClose={() => setShowAddCO(false)}
          onSaved={() => { setShowAddCO(false); refreshCOs() }}
        />
      )}

      {editCO && (
        <AddChangeOrderModal
          jobId={jobId}
          order={editCO}
          lines={lines}
          canDelete={permissions.can_delete}
          onClose={() => setEditCO(null)}
          onSaved={() => { setEditCO(null); refreshCOs() }}
        />
      )}

      {showAddPO && (
        <AddPOModal
          jobId={jobId}
          lines={lines}
          onClose={() => setShowAddPO(false)}
          onSaved={() => { setShowAddPO(false); refreshPOs() }}
        />
      )}

      {editPO && (
        <AddPOModal
          jobId={jobId}
          po={editPO}
          lines={lines}
          canDelete={permissions.can_delete}
          onClose={() => setEditPO(null)}
          onSaved={() => { setEditPO(null); refreshPOs() }}
        />
      )}
    </div>
  )
}
