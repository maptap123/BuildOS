// Validation for QuickBooks change proposals. Fixer can only ever send fields named
// here; anything else is rejected, not forwarded. Pure functions, no I/O.

export type QBEntity = 'customer' | 'invoice' | 'estimate'
export type QBAction = 'create' | 'update' | 'delete' | 'void' | 'send' | 'deactivate'

export const ENTITIES: QBEntity[] = ['customer', 'invoice', 'estimate']
export const ACTIONS: QBAction[] = ['create', 'update', 'delete', 'void', 'send', 'deactivate']

/** Which actions each entity supports. QuickBooks cannot delete customers, only deactivate them. */
const ALLOWED: Record<QBEntity, QBAction[]> = {
  customer: ['create', 'update', 'deactivate'],
  invoice: ['create', 'update', 'delete', 'void', 'send'],
  estimate: ['create', 'update', 'delete', 'send'],
}

type Spec =
  | 'string' | 'number' | 'boolean' | 'id' | 'date' | 'email'
  | { obj: Record<string, Spec> }
  | { arr: Spec; max: number }
  | { enum: string[] }

const REF: Spec = { obj: { value: 'id' } }
const EMAIL_OBJ: Spec = { obj: { Address: 'email' } }

const LINE: Spec = {
  obj: {
    Description: 'string',
    Amount: 'number',
    DetailType: { enum: ['SalesItemLineDetail', 'DescriptionOnly'] },
    SalesItemLineDetail: { obj: { ItemRef: REF, Qty: 'number', UnitPrice: 'number' } },
  },
}

const CUSTOMER_FIELDS: Record<string, Spec> = {
  DisplayName: 'string', GivenName: 'string', FamilyName: 'string', CompanyName: 'string',
  Notes: 'string', Job: 'boolean', BillWithParent: 'boolean', ParentRef: REF,
  PrimaryEmailAddr: EMAIL_OBJ,
  PrimaryPhone: { obj: { FreeFormNumber: 'string' } },
  BillAddr: { obj: { Line1: 'string', City: 'string', CountrySubDivisionCode: 'string', PostalCode: 'string' } },
}

const SALES_FIELDS: Record<string, Spec> = {
  CustomerRef: REF, TxnDate: 'date', DueDate: 'date', DocNumber: 'string', PrivateNote: 'string',
  CustomerMemo: { obj: { value: 'string' } }, BillEmail: EMAIL_OBJ, Line: { arr: LINE, max: 100 },
}
const ESTIMATE_FIELDS: Record<string, Spec> = { ...SALES_FIELDS, ExpirationDate: 'date' }

const FIELDS: Record<QBEntity, Record<string, Spec>> = {
  customer: CUSTOMER_FIELDS, invoice: SALES_FIELDS, estimate: ESTIMATE_FIELDS,
}

const MAX_STRING = 2000

function check(value: unknown, spec: Spec, path: string, errors: string[]): unknown {
  if (spec === 'string') {
    if (typeof value !== 'string' || value.length > MAX_STRING) { errors.push(`${path}: text up to ${MAX_STRING} characters`); return undefined }
    return value.trim()
  }
  if (spec === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e8) { errors.push(`${path}: a number`); return undefined }
    return value
  }
  if (spec === 'boolean') {
    if (typeof value !== 'boolean') { errors.push(`${path}: true or false`); return undefined }
    return value
  }
  if (spec === 'id') {
    const s = typeof value === 'number' ? String(value) : value
    if (typeof s !== 'string' || !/^\d{1,20}$/.test(s)) { errors.push(`${path}: a numeric QuickBooks ID`); return undefined }
    return s
  }
  if (spec === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) { errors.push(`${path}: a date as YYYY-MM-DD`); return undefined }
    return value
  }
  if (spec === 'email') {
    if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) { errors.push(`${path}: an email address`); return undefined }
    return value
  }
  if ('enum' in spec) {
    if (typeof value !== 'string' || !spec.enum.includes(value)) { errors.push(`${path}: one of ${spec.enum.join(', ')}`); return undefined }
    return value
  }
  if ('arr' in spec) {
    if (!Array.isArray(value) || value.length > spec.max) { errors.push(`${path}: a list of up to ${spec.max} items`); return undefined }
    return value.map((v, i) => check(v, spec.arr, `${path}[${i}]`, errors))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: an object`); return undefined }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const child = spec.obj[k]
    if (!child) { errors.push(`${path}.${k}: field is not allowed`); continue }
    const checked = check(v, child, `${path}.${k}`, errors)
    if (checked !== undefined) out[k] = checked
  }
  return out
}

export interface ValidChange {
  entity: QBEntity
  action: QBAction
  entityId: string | null
  /** Whitelisted, normalised fields to send. For `send`, may carry send_to. */
  data: Record<string, unknown>
  sendTo: string | null
}

/** Returns the cleaned change, or a list of plain-language problems for Fixer to fix and retry. */
export function validateChange(input: {
  entity: unknown; action: unknown; entity_id?: unknown; data?: unknown; send_to?: unknown
}): { ok: true; change: ValidChange } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const entity = input.entity as QBEntity
  const action = input.action as QBAction
  if (!ENTITIES.includes(entity)) return { ok: false, errors: [`entity must be one of ${ENTITIES.join(', ')}`] }
  if (!ACTIONS.includes(action)) return { ok: false, errors: [`action must be one of ${ACTIONS.join(', ')}`] }
  if (!ALLOWED[entity].includes(action)) {
    const hint = entity === 'customer' && String(action) === 'delete'
      ? ' QuickBooks cannot delete customers; use action "deactivate".' : ''
    return { ok: false, errors: [`${entity} does not support "${action}". Allowed: ${ALLOWED[entity].join(', ')}.${hint}`] }
  }

  let entityId: string | null = null
  if (action !== 'create') {
    const id = typeof input.entity_id === 'number' ? String(input.entity_id) : input.entity_id
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) errors.push('entity_id is required: the numeric QuickBooks ID of the record')
    else entityId = id
  }

  let data: Record<string, unknown> = {}
  const needsData = action === 'create' || action === 'update'
  if (needsData) {
    const raw = input.data ?? {}
    data = (check(raw, { obj: FIELDS[entity] }, 'data', errors) ?? {}) as Record<string, unknown>
    if (action === 'update' && Object.keys(data).length === 0) errors.push('data must contain at least one field to change')
    if (action === 'create') {
      if (entity === 'customer') {
        if (!data.DisplayName) errors.push('data.DisplayName is required to create a customer')
        if (data.Job === true && !data.ParentRef) errors.push('data.ParentRef is required when Job is true (a job lives under a customer)')
      } else {
        if (!data.CustomerRef) errors.push('data.CustomerRef is required (the QuickBooks customer or job ID)')
        if (!Array.isArray(data.Line) || data.Line.length === 0) errors.push('data.Line needs at least one line')
      }
    }
    // Fill Amount from Qty × UnitPrice, and reject lines that would post nothing or a wrong total.
    if (Array.isArray(data.Line)) {
      data.Line = (data.Line as Record<string, unknown>[]).map((l, i) => {
        const type = (l.DetailType as string) ?? (l.SalesItemLineDetail ? 'SalesItemLineDetail' : 'DescriptionOnly')
        const det = (l.SalesItemLineDetail ?? {}) as Record<string, unknown>
        let amount = l.Amount as number | undefined
        if (type === 'SalesItemLineDetail') {
          if (!det.ItemRef) errors.push(`data.Line[${i}]: a sales line needs SalesItemLineDetail.ItemRef (the QuickBooks product/service ID)`)
          if (amount === undefined && typeof det.Qty === 'number' && typeof det.UnitPrice === 'number') amount = Math.round(det.Qty * det.UnitPrice * 100) / 100
          if (amount === undefined) errors.push(`data.Line[${i}]: give Amount, or both Qty and UnitPrice`)
        }
        return { ...l, DetailType: type, ...(amount !== undefined ? { Amount: amount } : {}) }
      })
    }
  }

  let sendTo: string | null = null
  if (action === 'send' && input.send_to !== undefined) {
    const v = check(input.send_to, 'email', 'send_to', errors)
    sendTo = typeof v === 'string' ? v : null
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, change: { entity, action, entityId, data, sendTo } }
}

export function lineTotal(lines: unknown): number {
  if (!Array.isArray(lines)) return 0
  return Math.round(lines.reduce((s, l) => s + (typeof (l as { Amount?: number }).Amount === 'number' ? (l as { Amount: number }).Amount : 0), 0) * 100) / 100
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** The sentence shown on the approval card. Built here from validated data, never taken from Fixer. */
export function summarize(c: ValidChange, ctx: { customerName?: string | null; beforeLabel?: string | null }): string {
  const who = ctx.customerName ? ` for ${ctx.customerName}` : ''
  const thing = ctx.beforeLabel ? ` ${ctx.beforeLabel}` : c.entityId ? ` #${c.entityId}` : ''
  switch (c.action) {
    case 'create':
      if (c.entity === 'customer') {
        const name = (c.data.DisplayName as string) ?? 'new customer'
        return c.data.Job === true ? `Create job "${name}" under ${ctx.customerName ?? 'a customer'}` : `Create customer "${name}"`
      }
      return `Create ${c.entity}${who}: ${(c.data.Line as unknown[])?.length ?? 0} line(s), ${money(lineTotal(c.data.Line))}`
    case 'update': return `Edit ${c.entity}${thing}: change ${Object.keys(c.data).join(', ')}`
    case 'delete': return `DELETE ${c.entity}${thing}`
    case 'void': return `VOID invoice${thing}`
    case 'deactivate': return `Deactivate customer${thing} (hides it in QuickBooks; history is kept)`
    case 'send': return `Email ${c.entity}${thing}${c.sendTo ? ` to ${c.sendTo}` : ' to the address on file'}`
  }
}
