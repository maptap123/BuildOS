'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { TagOption } from '@/hooks/useTagOptions'

interface Props {
  initialTags: TagOption[]
}

export function AdminTagsClient({ initialTags }: Props) {
  const [tags, setTags] = useState<TagOption[]>(initialTags)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addTag(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setError(null)

    const res = await fetch('/api/settings/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (res.ok) {
      const tag = await res.json()
      setTags(prev => [...prev, tag].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)))
      setNewName('')
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to add tag')
    }
    setAdding(false)
  }

  async function removeTag(tag: TagOption) {
    const res = await fetch(`/api/settings/tags?id=${tag.id}`, { method: 'DELETE' })
    if (res.ok) {
      setTags(prev => prev.filter(t => t.id !== tag.id))
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6">
      <h2 className="font-display font-semibold text-navy-900 text-base mb-1">Job Tags</h2>
      <p className="text-xs text-gray-400 mb-5">
        Tags appear as selectable chips when creating or filtering jobs.
      </p>

      <div className="flex flex-wrap gap-2 mb-5 min-h-[2rem]">
        {tags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-navy-800"
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title={`Remove "${tag.name}"`}
            >
              <Trash2 size={13} />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-gray-400">No tags yet.</p>
        )}
      </div>

      <form onSubmit={addTag} className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New tag name…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Add
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
