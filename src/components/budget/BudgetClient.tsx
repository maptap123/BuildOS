'use client'

import { useState } from 'react'
import { AlertCircle, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { useBudget } from '@/hooks/useBudget'
import { useChangeOrders } from '@/hooks/useChangeOrders'
import { BudgetSummary } from './BudgetSummary'
import { BudgetLineTable } from './BudgetLineTable'
import { AddBudgetLineModal } from './AddBudgetLineModal'
import { AddActualModal } from './AddActualModal'
import { ChangeOrderTable } from './ChangeOrderTable'
import { AddChangeOrderModal } from './AddChangeOrderModal'
import type { Job, BudgetLine, Actual, ChangeOrder, QBSyncStatus } from '@/types'

interface Permissions {
  can_create: boolean
  can_edit: boolean
  can_delete: boolean
}

interface Props {
  jobId: string
  job: Pick<Job, 'id' | 'contract_amount' | 'estimated_cost' | 'qb_sync_status' | 'qb_last_synced_at' | 'qb_customer_id'>
  initialLines: BudgetLine[]
  initialActuals: Actual[]
  initialChangeOrders: ChangeOrder[]
  permissions: Permissions
}

type Tab = 'budget' | 'change_orders'

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
  jobId, job, initialLines, initialActuals, initialChangeOrders, permissions
}: Props) {
  const { lines, actuals, loading: budgetLoading, error: budgetError, refresh: refreshBudget } = useBudget(jobId, initialLines, initialActuals)
  const { orders, loading: coLoading, error: coError, refresh: refreshCOs } = useChangeOrders(jobId, initialChangeOrders)

  const [tab, setTab] = useState<Tab>('budget')
  const [showAddLine, setShowAddLine]           = useState(false)
  const [addActualForLine, setAddActualForLine] = useState<string | null>(null)
  const [showAddCO, setShowAddCO]               = useState(false)
  const [editCO, setEditCO]                     = useState<ChangeOrder | null>(null)

  const loading = tab === 'budget' ? budgetLoading : coLoading
  const error   = tab === 'budget' ? budgetError   : coError

  const approvedCOTotal = orders
    .filter(co => co.status === 'approved')
    .reduce((s, co) => s + (co.type === 'deductive' ? -co.amount : co.amount), 0)

  return (
    <div className="space-y-5">

      {/* QB sync status bar */}
      <div className="flex items-center justify-between">
        <QBSyncBadge status={job.qb_sync_status} lastSynced={job.qb_last_synced_at} />
        {job.qb_sync_status !== 'not_synced' && (
          <span className="text-xs text-gray-400">
            {job.qb_customer_id ? `QB Customer: ${job.qb_customer_id}` : ''}
          </span>
        )}
      </div>

      <BudgetSummary job={job} lines={lines} approvedCOTotal={approvedCOTotal} />

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
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
          Loading {tab === 'budget' ? 'budget' : 'change orders'}…
        </div>
      ) : tab === 'budget' ? (
        <BudgetLineTable
          lines={lines}
          actuals={actuals}
          permissions={permissions}
          onAddLine={() => setShowAddLine(true)}
          onAddActual={lineId => setAddActualForLine(lineId)}
        />
      ) : (
        <ChangeOrderTable
          changeOrders={orders}
          permissions={permissions}
          onAdd={() => setShowAddCO(true)}
          onEdit={co => setEditCO(co)}
        />
      )}

      {showAddLine && (
        <AddBudgetLineModal
          jobId={jobId}
          onClose={() => setShowAddLine(false)}
          onCreated={() => { setShowAddLine(false); refreshBudget() }}
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
    </div>
  )
}
