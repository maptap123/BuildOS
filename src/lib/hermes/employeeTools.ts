/** Standalone allowlist. Never import the broad agent/gateway tool registry. */
const pagination = { limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0 } }
const jobId = { type: 'string', format: 'uuid' }
export const EMPLOYEE_TOOLS = [
  { name: 'list_jobs', description: 'Read job identity, status, site and dates; no money or private notes.', parameters: { type: 'object', additionalProperties: false, properties: { ...pagination, job_id: jobId, search: { type: 'string', maxLength: 100 } } } },
  ...['list_tasks', 'list_schedule', 'list_daily_logs'].map(name => ({ name,
    description: name === 'list_daily_logs' ? 'Read dated log metadata only. Work notes are excluded from the employee projection.' : 'Read operational job records, not private descriptions or financial fields.',
    parameters: { type: 'object', additionalProperties: false, properties: { ...pagination, job_id: jobId }, required: ['job_id'] } })),
  { name: 'read_job_finance', description: 'Approved exact-job budget figures only; asking triggers August review when not already scoped. Requires existing budget access.', parameters: { type: 'object', additionalProperties: false, properties: { ...pagination, job_id: jobId }, required: ['job_id'] } },
  { name: 'read_job_actuals', description: 'Approved exact-job sum of approved/paid actual costs only. Requires existing budget access; never vendor/payroll detail.', parameters: { type: 'object', additionalProperties: false, properties: { job_id: jobId }, required: ['job_id'] } },
  { name: 'read_compensation', description: 'Approved exact-account hourly/overtime rates only; requires existing admin access. Never enumerate people or guess a person ID.', parameters: { type: 'object', additionalProperties: false, properties: { person_id: jobId }, required: ['person_id'] } },
]
