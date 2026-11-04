// Where to send the user when they pick a different job: stay on the same
// section (schedule, budget, logs...) instead of dropping onto the job's home page.

const ALL_JOBS_TO_SECTION: Record<string, string> = {
  '/schedule': 'schedule',
  '/tasks':    'tasks',
  '/logs':     'logs',
  '/finance':  'budget',
}

// Sections that only make sense for the job they were opened on.
const NOT_CARRIED = new Set(['edit'])

export function hrefForJob(pathname: string, jobId: string): string {
  const scoped = pathname.match(/^\/jobs\/[^/]+\/(.+)$/)
  if (scoped && !NOT_CARRIED.has(scoped[1].split('/')[0])) {
    // Keep the section; drop deeper detail ids that belong to the old job.
    const section = scoped[1].split('/')[0]
    return `/jobs/${jobId}/${section}`
  }
  const section = ALL_JOBS_TO_SECTION[pathname.replace(/\/$/, '')]
  if (section) return `/jobs/${jobId}/${section}`
  return `/jobs/${jobId}`
}
