// Purpose: Shared TypeScript interfaces that mirror the core Supabase tables for BuildOS.

export type PermissionModule =
  | "jobs"
  | "budget"
  | "schedule"
  | "tasks"
  | "logs"
  | "documents"
  | "admin"
  | "ai";

export type JobStatus =
  | "lead"
  | "presale"
  | "active"
  | "warranty"
  | "closed"
  | "archived";

export type QBSyncStatus = "not_synced" | "pending" | "synced" | "error";

export type BudgetLineStatus = "draft" | "approved" | "change_order" | "closed";

export type ActualStatus = "pending" | "approved" | "rejected" | "paid";

export type PaymentMethod = "check" | "credit_card" | "ach" | "cash" | "other";

export type ChangeOrderStatus = "draft" | "submitted" | "approved" | "rejected" | "voided";

export type ChangeOrderType = "additive" | "deductive" | "neutral";

export type ScheduleItemStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "completed"
  | "delayed";

export type ScheduleItemType = "phase" | "milestone";

export type OutlookSyncStatus = "not_synced" | "pending" | "synced" | "error";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type DocumentModule =
  | "job"
  | "budget"
  | "schedule"
  | "task"
  | "daily_log"
  | "admin";

export type IntegrationService = "quickbooks" | "outlook" | "google_calendar"

export type TimeEntryApprovalStatus = "pending" | "approved" | "rejected"

export type PredecessorType = "FS" | "SS" | "FF" | "SF"

export interface SchedulePredecessor {
  id: string
  job_id: string
  item_id: string
  predecessor_id: string
  type: PredecessorType
  lag_days: number
  created_by: string
  created_at: string
  updated_at: string
  // joined from schedule_items
  predecessor?: { id: string; title: string } | null
};

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  qb_employee_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntry {
  id: string;
  job_id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  break_minutes: number;
  cost_code: string | null;
  hourly_rate: number | null;
  overtime_rate: number | null;
  labor_cost: number | null;
  notes: string | null;
  tags: string[];
  approval_status: TimeEntryApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  qb_time_activity_id: string | null;
  qb_synced: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  user?: Pick<User, 'id' | 'full_name' | 'avatar_url' | 'hourly_rate'> | null;
  job?: Pick<Job, 'id' | 'name'> | null;
}

export interface UserPermission {
  id: string;
  user_id: string;
  module: PermissionModule;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_manage: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_number: string;
  name: string;
  description: string | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  site_address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  status: JobStatus;
  lead_id: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  actual_completion_date: string | null;
  contract_amount: number | null;
  estimated_cost: number | null;
  project_manager_id: string | null;
  superintendent_id: string | null;
  tags: string[];
  // Closeout & warranty
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  closeout_checklist: Record<string, boolean>;
  // QuickBooks integration
  qb_customer_id: string | null;
  qb_project_id: string | null;
  qb_sync_status: QBSyncStatus;
  qb_last_synced_at: string | null;
  qb_sync_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  job_id: string;
  cost_code: string;
  category: string;
  description: string;
  status: BudgetLineStatus;
  phase: string | null;
  original_budget: number;
  revised_budget: number;
  committed_cost: number;
  forecast_cost: number | null;
  notes: string | null;
  qb_item_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Actual {
  id: string;
  job_id: string;
  budget_line_id: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  description: string;
  amount: number;
  status: ActualStatus;
  incurred_date: string;
  approved_by: string | null;
  approved_at: string | null;
  document_id: string | null;
  // QuickBooks sync
  qb_bill_id: string | null;
  qb_vendor_id: string | null;
  qb_synced: boolean;
  po_number: string | null;
  payment_method: PaymentMethod | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChangeOrder {
  id: string;
  job_id: string;
  co_number: string;
  title: string;
  description: string | null;
  status: ChangeOrderStatus;
  type: ChangeOrderType;
  amount: number;
  reason: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  approved_by: string | null;
  budget_line_id: string | null;
  qb_estimate_id: string | null;
  client_token: string | null;
  client_approved_at: string | null;
  client_rejected_at: string | null;
  client_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: ScheduleItemStatus;
  type: ScheduleItemType;
  start_date: string;
  end_date: string;
  all_day: boolean;
  assigned_user_id: string | null;
  predecessor_id: string | null;
  sort_order: number;
  percent_complete: number;
  trade: string | null;
  color: string | null;
  // Outlook sync
  outlook_event_id: string | null;
  outlook_calendar_id: string | null;
  outlook_sync_status: OutlookSyncStatus;
  outlook_last_synced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  schedule_item_id: string | null;
  tags: string[];
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  job_id: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  author?: { full_name: string | null; email: string } | null;
}

export interface DailyLog {
  id: string;
  job_id: string;
  bt_log_id?: string | null;
  log_date: string;
  logged_at: string | null;
  author_name: string | null;
  weather_summary: string | null;
  temperature_high: number | null;
  temperature_low: number | null;
  manpower_count: number | null;
  work_performed: string | null;
  delays: string | null;
  safety_notes: string | null;
  inspection_notes: string | null;
  ai_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LogPhoto {
  id: string;
  log_id: string | null;
  job_id: string;
  bt_photo_id?: string | null;
  bt_log_id?: string | null;
  file_name: string | null;
  storage_path: string | null;
  caption: string | null;
  taken_at: string | null;
  created_at: string;
  url: string | null; // populated by API from Supabase Storage
}

export interface Document {
  id: string;
  job_id: string | null;
  module: DocumentModule;
  related_record_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  storage_bucket: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string
  job_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  is_primary: boolean
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  jobs?: { name: string } | null
}

export interface IntegrationSetting {
  id: string;
  service: IntegrationService;
  is_connected: boolean;
  realm_id: string | null;
  settings_json: Record<string, unknown>;
  connected_by: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaTask {
  id: string;
  job_id: string;
  job_name: string;
  title: string;
  priority: TaskPriority;
  due_date: string;
  status: TaskStatus;
}

export interface AgendaScheduleItem {
  id: string;
  job_id: string;
  job_name: string;
  title: string;
  start_date: string;
  end_date: string;
  status: ScheduleItemStatus;
}

export interface AgendaLogEntry {
  id: string;
  job_id: string;
  job_name: string;
  log_date: string;
  bt_log_id?: string | null;
  author_name: string | null;
  work_performed: string | null;
  weather_summary?: string | null;
  manpower_count?: number | null;
  photos?: Pick<LogPhoto, 'id' | 'file_name' | 'caption' | 'url'>[];
}

export interface AgendaPayload {
  past_due: AgendaTask[];
  due_today: AgendaTask[];
  this_week: AgendaScheduleItem[];
  team_activity: AgendaLogEntry[];
  missing_perms: Array<'tasks' | 'schedule' | 'logs'>;
}

export type POStatus = 'draft' | 'sent' | 'received' | 'closed' | 'cancelled'

export interface PurchaseOrder {
  id: string
  job_id: string
  budget_line_id: string | null
  vendor_name: string
  po_number: string | null
  description: string
  amount: number
  status: POStatus
  issued_date: string | null
  expected_date: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  budget_lines?: { cost_code: string; description: string } | null
}

export type BillingMilestoneStatus = 'pending' | 'invoiced' | 'paid'

export interface BillingMilestone {
  id: string
  job_id: string
  title: string
  description: string | null
  amount: number
  status: BillingMilestoneStatus
  due_date: string | null
  invoiced_date: string | null
  paid_date: string | null
  invoice_number: string | null
  notes: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type LeadStatus = 'new' | 'contacted' | 'proposal' | 'won' | 'lost'
export type LeadSource = 'referral' | 'website' | 'cold_call' | 'repeat' | 'other'

export interface Lead {
  id: string
  title: string
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  source: LeadSource | null
  status: LeadStatus
  estimated_value: number | null
  notes: string | null
  address: string | null
  assigned_to: string | null
  converted_job_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LeadActivity {
  id: string
  lead_id: string
  note: string
  created_by: string
  created_at: string
}

// ─────────────────────────────────────────────
// ESTIMATE BUILDER
// ─────────────────────────────────────────────

export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'voided'

export interface CostCatalogItem {
  id: string
  cost_code: string
  division_num: string
  division_name: string
  phase: string | null
  title: string
  description: string | null
  uom: string
  unit_cost: number
  labor_cost: number
  material_cost: number
  cost_type: string | null
  taxable: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Estimate {
  id: string
  lead_id: string | null
  job_id: string | null
  job_name: string
  job_type: string
  markup_pct: number
  status: EstimateStatus
  scope_text: string | null
  scope_confirmed: boolean
  internal_notes: string | null
  title: string | null
  version: number
  notes: string | null
  public_token: string | null
  client_approved_at: string | null
  client_rejected_at: string | null
  client_name: string | null
  client_signature: string | null
  client_response_note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Proposal visibility settings
  show_line_details: boolean
  show_cost_breakdown: boolean
  proposal_header_text: string | null
  proposal_footer_text: string | null
}

export interface EstimateLine {
  id: string
  estimate_id: string
  lead_id: string
  cost_item_id: string | null
  description: string
  phase: string | null
  cost_code: string | null
  uom: string
  quantity: number
  unit_cost: number
  markup_pct: number
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
  // Proposal visibility
  client_visible: boolean
  internal_note: string | null
}

export type VendorType = 'subcontractor' | 'supplier' | 'equipment' | 'other'

export interface Vendor {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  vendor_type: VendorType
  trade: string | null
  license_number: string | null
  insurance_expiry: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type WorkOrderStatus = 'draft' | 'sent' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'

export interface WorkOrder {
  id: string
  job_id: string
  vendor_id: string | null
  budget_line_id: string | null
  wo_number: string
  title: string
  description: string | null
  scope_of_work: string | null
  amount: number
  status: WorkOrderStatus
  issued_date: string | null
  start_date: string | null
  completion_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  vendors?: Pick<Vendor, 'id' | 'name' | 'trade' | 'vendor_type'> | null
  budget_lines?: Pick<BudgetLine, 'id' | 'cost_code' | 'description'> | null
}
