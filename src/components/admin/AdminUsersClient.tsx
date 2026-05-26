'use client'

import { useMemo, useState } from 'react'
import { ShieldCheck, Users, Save, RefreshCw, Search, UserPlus, X } from 'lucide-react'
import type { PermissionModule, User, UserPermission } from '@/types'

type PermissionFlag = 'can_view' | 'can_create' | 'can_edit' | 'can_delete' | 'can_export' | 'can_manage'
type PermissionPatch = Pick<UserPermission, PermissionFlag>

interface Props {
  currentUserId: string
  initialUsers: User[]
  initialPermissions: UserPermission[]
}

const MODULES: { key: PermissionModule; label: string; helper: string }[] = [
  { key: 'jobs', label: 'Jobs', helper: 'Job list, job details, contacts' },
  { key: 'budget', label: 'Budget', helper: 'Budget, actuals, change orders' },
  { key: 'schedule', label: 'Schedule', helper: 'Job schedules and calendar sync' },
  { key: 'tasks', label: 'Tasks', helper: 'Task lists and comments' },
  { key: 'logs', label: 'Logs', helper: 'Daily logs and jobsite notes' },
  { key: 'documents', label: 'Documents', helper: 'Files and uploads' },
  { key: 'ai', label: 'AI', helper: 'AI summaries and agent tools' },
  { key: 'admin', label: 'Admin', helper: 'Users, permissions, settings' },
]

const FLAGS: { key: PermissionFlag; label: string }[] = [
  { key: 'can_view', label: 'View' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_export', label: 'Export' },
  { key: 'can_manage', label: 'Manage' },
]

const EMPTY_PERMISSION: PermissionPatch = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_export: false,
  can_manage: false,
}

function userLabel(user: User) {
  return user.full_name?.trim() || user.email
}

function permissionKey(userId: string, module: PermissionModule) {
  return `${userId}:${module}`
}

function toPatch(permission?: UserPermission): PermissionPatch {
  if (!permission) return { ...EMPTY_PERMISSION }
  return {
    can_view: permission.can_view,
    can_create: permission.can_create,
    can_edit: permission.can_edit,
    can_delete: permission.can_delete,
    can_export: permission.can_export,
    can_manage: permission.can_manage,
  }
}

export function AdminUsersClient({ currentUserId, initialUsers, initialPermissions }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [permissions, setPermissions] = useState(() => {
    const map: Record<string, PermissionPatch> = {}
    initialPermissions.forEach(permission => {
      map[permissionKey(permission.user_id, permission.module)] = toPatch(permission)
    })
    return map
  })
  const [selectedUserId, setSelectedUserId] = useState(initialUsers[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(user =>
      user.email.toLowerCase().includes(q) ||
      (user.full_name ?? '').toLowerCase().includes(q) ||
      (user.company_name ?? '').toLowerCase().includes(q)
    )
  }, [search, users])

  const selectedUser = users.find(user => user.id === selectedUserId) ?? users[0]

  function getPermission(userId: string, module: PermissionModule) {
    return permissions[permissionKey(userId, module)] ?? { ...EMPTY_PERMISSION }
  }

  async function updatePermission(module: PermissionModule, flag: PermissionFlag, value: boolean) {
    if (!selectedUser) return

    const key = permissionKey(selectedUser.id, module)
    const previous = getPermission(selectedUser.id, module)
    const next = { ...previous, [flag]: value }

    setPermissions(current => ({ ...current, [key]: next }))
    setSavingKey(`${key}:${flag}`)
    setError(null)

    try {
      const res = await fetch('/api/admin/users/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUser.id,
          module,
          permissions: next,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Permission update failed')
      }
    } catch (e) {
      setPermissions(current => ({ ...current, [key]: previous }))
      setError(e instanceof Error ? e.message : 'Permission update failed')
    } finally {
      setSavingKey(null)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError(null)
    setInviteSuccess(null)
    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), full_name: inviteName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Invite failed')
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail('')
      setInviteName('')
      // Optimistically add to list
      setUsers(prev => [...prev, {
        id: body.id,
        email: body.email,
        full_name: inviteName.trim() || null,
        phone: null, company_name: null, avatar_url: null,
        is_active: true, last_sign_in_at: null,
        hourly_rate: null, overtime_rate: null, qb_employee_id: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }])
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setInviting(false)
    }
  }

  if (!selectedUser && users.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-8 text-center text-gray-400 text-sm">
        No users found yet.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gold-600 mb-1">
            <ShieldCheck size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Admin</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Users & Permissions</h1>
          <p className="text-sm text-gray-500 mt-1">Control who can access each part of BuildOS.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <Users size={14} />
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
          <button
            onClick={() => { setShowInvite(true); setInviteError(null); setInviteSuccess(null) }}
            className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <UserPlus size={13} />
            Invite User
          </button>
        </div>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-navy-900 text-lg">Invite User</h3>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Full Name <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="e.g. Kevin G"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
                />
              </div>
              {inviteError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>
              )}
              {inviteSuccess && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{inviteSuccess}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                >
                  {inviting ? 'Sending…' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-navy-300"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-100 max-h-[620px] overflow-y-auto">
            {filteredUsers.map(user => {
              const active = user.id === selectedUser.id
              const isCurrent = user.id === currentUserId
              return (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    active ? 'bg-navy-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-navy-900 truncate">{userLabel(user)}</p>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold text-gold-600 bg-gold-50 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  {!user.is_active && (
                    <p className="text-[10px] text-red-500 font-semibold mt-1">Inactive</p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-display font-semibold text-navy-900 text-lg">{userLabel(selectedUser)}</h2>
                <p className="text-sm text-gray-400">{selectedUser.email}</p>
              </div>
              <p className="text-xs text-gray-400">
                Created {new Date(selectedUser.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-56">Module</th>
                  {FLAGS.map(flag => (
                    <th key={flag.key} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {flag.label}
                    </th>
                  ))}
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MODULES.map(module => {
                  const row = getPermission(selectedUser.id, module.key)
                  const rowSaving = savingKey?.startsWith(permissionKey(selectedUser.id, module.key))
                  return (
                    <tr key={module.key} className="hover:bg-gray-50/70">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-navy-900">{module.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{module.helper}</p>
                      </td>
                      {FLAGS.map(flag => {
                        const toggleKey = `${permissionKey(selectedUser.id, module.key)}:${flag.key}`
                        return (
                          <td key={flag.key} className="px-3 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={row[flag.key]}
                              disabled={savingKey === toggleKey}
                              onChange={e => updatePermission(module.key, flag.key, e.target.checked)}
                              className="h-4 w-4 accent-gold-500 cursor-pointer disabled:cursor-wait"
                              aria-label={`${module.label} ${flag.label}`}
                            />
                          </td>
                        )
                      })}
                      <td className="px-5 py-4 text-right">
                        {rowSaving ? (
                          <RefreshCw size={14} className="inline text-blue-500 animate-spin" />
                        ) : (
                          <Save size={14} className="inline text-gray-300" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
