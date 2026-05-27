'use client'

/**
 * ActiveJobContext
 *
 * Provides a single "active job" context shared across the entire mobile app.
 * Persisted to localStorage so the last-selected job is remembered across boots.
 *
 * Usage:
 *   const { activeJob, activeJobId, setActiveJob, clearActiveJob } = useActiveJob()
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'buildos_active_job'

export interface ActiveJob {
  id: string
  name: string
  job_number: string
  status: string
  client_name: string | null
}

interface ActiveJobContextValue {
  /** Full active job object, or null if none selected */
  activeJob: ActiveJob | null
  /** Shorthand for activeJob?.id ?? null */
  activeJobId: string | null
  /** Set the active job (also persists to localStorage) */
  setActiveJob: (job: ActiveJob | null) => void
  /** Clear the active job context */
  clearActiveJob: () => void
}

const ActiveJobContext = createContext<ActiveJobContextValue>({
  activeJob: null,
  activeJobId: null,
  setActiveJob: () => {},
  clearActiveJob: () => {},
})

export function ActiveJobProvider({ children }: { children: ReactNode }) {
  const [activeJob, setActiveJobState] = useState<ActiveJob | null>(null)

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ActiveJob
        // Basic sanity check
        if (parsed?.id && parsed?.name) {
          setActiveJobState(parsed)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  const setActiveJob = useCallback((job: ActiveJob | null) => {
    setActiveJobState(job)
    try {
      if (job) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(job))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Ignore storage errors (private browsing, quota, etc.)
    }
  }, [])

  const clearActiveJob = useCallback(() => setActiveJob(null), [setActiveJob])

  return (
    <ActiveJobContext.Provider
      value={{
        activeJob,
        activeJobId: activeJob?.id ?? null,
        setActiveJob,
        clearActiveJob,
      }}
    >
      {children}
    </ActiveJobContext.Provider>
  )
}

/**
 * useActiveJob — consume the active job context from anywhere in the app.
 * Must be used inside <ActiveJobProvider>.
 */
export function useActiveJob() {
  return useContext(ActiveJobContext)
}
