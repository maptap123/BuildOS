# JDC Platform Product Checklist

Living checklist for building JDC Platform into a serious Buildertrend / JobTread / Klutch AI competitor.

## Current Product Baseline

- [x] Supabase auth foundation
- [x] User permissions model
- [x] Jobs list and job detail dashboard
- [x] Job-specific budget page
- [x] Budget lines
- [x] Actual costs
- [x] Change orders
- [x] Job-specific schedule page
- [x] Job-specific task page
- [x] Task comments
- [x] Job-specific daily logs page
- [x] Contacts table in database
- [x] Log photos table in database
- [x] Documents table in database
- [x] Buildertrend export data present in workspace
- [x] AI endpoint for daily log summary and estimating help
- [x] Internal agent endpoint with job/task/schedule/budget/log tools
- [x] QuickBooks integration placeholder
- [x] Outlook integration placeholder

## Phase 1: Make The Core Trustworthy

Goal: turn the current app from promising prototype into something stable enough to build on every day.

- [x] Fix lint issues
- [x] Fix production build issue caused by Google font fetch
- [x] Add a real admin/users/permissions screen
- [ ] Add fine-grained job and budget visibility controls after job/budget features are more fully built out
- [x] Add New Job flow
- [x] Add Edit Job flow
- [x] Add delete/archive job handling
- [x] Replace static all-jobs side panels with real data
- [x] Show overdue tasks across all jobs
- [x] Show tasks due today across all jobs
- [x] Show this week schedule across all jobs
- [x] Show recent team activity across all jobs
- [x] Add application README that explains setup, data model, scripts, and deployment
- [x] Add basic smoke test checklist for manual QA

## Phase 2: Field Operating System

Goal: make the app useful to the field every day.

- [ ] Add visible Documents module to navigation
- [ ] Build job document/file center
- [ ] Add file upload to Supabase storage
- [ ] Add file preview/download links
- [ ] Connect documents to jobs, logs, tasks, budget lines, and change orders
- [ ] Build contacts/client directory UI
- [ ] Show contacts on job detail
- [ ] Add contact create/edit/delete flows
- [ ] Add log photo upload
- [ ] Show log photos in daily log feed
- [ ] Add photo captions
- [ ] Add mobile-friendly daily log creation flow
- [ ] Add weather capture helper
- [ ] Add safety notes / incidents structure
- [ ] Add manpower by trade
- [ ] Add job activity feed
- [ ] Add comments/mentions on job records
- [ ] Add notifications foundation

## Phase 3: Money And Commitments

Goal: make budgets, change orders, costs, and commitments reliable enough for real job control.

- [ ] Improve budget summary: contract, revised contract, budget, committed, actual, forecast, variance
- [ ] Add budget phase grouping
- [ ] Add cost code catalog
- [ ] Add purchase orders table
- [ ] Add purchase orders UI
- [ ] Add work orders table
- [ ] Add work orders UI
- [ ] Add vendor directory
- [ ] Add bills/invoices table
- [ ] Add bill approval status workflow
- [ ] Link actual costs to purchase orders and bills
- [ ] Add change order approval workflow
- [ ] Add change order PDF generation
- [ ] Add change order client signature status
- [ ] Add client-facing change order approval link
- [ ] Add job profitability report
- [ ] Add cash flow / billing schedule view

## Phase 4: Real Integrations

Goal: stop being a placeholder and sync with the tools contractors already use.

- [ ] Add QuickBooks OAuth connection flow
- [ ] Store encrypted QuickBooks tokens
- [ ] Sync jobs to QuickBooks customers/projects
- [ ] Sync approved actuals to QuickBooks bills
- [ ] Sync invoices/payments from QuickBooks
- [ ] Add QuickBooks sync status dashboard
- [ ] Add Outlook OAuth connection flow
- [ ] Store encrypted Outlook tokens
- [ ] Sync schedule items to Outlook calendar events
- [ ] Add Google Calendar connection option
- [ ] Add webhook/background job strategy for sync retries
- [ ] Add integration error logs visible to admins

## Phase 5: Sales, Estimating, And Proposals

Goal: cover the pre-construction workflow that Buildertrend and JobTread users expect.

- [ ] Add leads/CRM pipeline
- [ ] Add website contact form lead intake
- [ ] Add lead source for website contact form submissions
- [ ] Add lead notification when a new website inquiry comes in
- [ ] Add lead source tracking
- [ ] Add lead detail page with contact info, project notes, status, and follow-up history
- [ ] Add convert lead to job/project flow
- [ ] Add estimate table
- [ ] Add estimate builder UI
- [ ] Add cost catalog / assemblies
- [ ] Add proposal builder
- [ ] Add proposal PDF generation
- [ ] Add proposal approval/signature flow
- [ ] Convert accepted proposal into job, budget, and schedule
- [ ] Add bid requests
- [ ] Add vendor bid comparison / bid leveling
- [ ] Add basic takeoff placeholder workflow

## Phase 6: Portals And Communication

Goal: give clients and subs a reason to live in the platform.

- [ ] Add customer portal role
- [ ] Add customer portal login/access flow
- [ ] Show approved schedule milestones to client
- [ ] Show client-visible photos/documents
- [ ] Show client-visible change orders
- [ ] Add client messaging
- [ ] Add client approvals
- [ ] Add sub/vendor portal role
- [ ] Add sub/vendor portal access flow
- [ ] Show assigned tasks/work orders to subs
- [ ] Allow subs to upload photos/docs
- [ ] Allow vendors to submit bids/bills
- [ ] Add email notifications
- [ ] Add SMS notification strategy

## Phase 7: AI Advantage

Goal: become more than a Buildertrend clone by turning project data into action.

- [ ] Add AI command center UI
- [ ] Add natural language search across jobs
- [ ] Add natural language search across tasks
- [ ] Add natural language search across schedule
- [ ] Add natural language search across logs
- [ ] Add natural language search across documents
- [ ] Add daily AI project brief
- [ ] Add overdue/stale task risk detection
- [ ] Add schedule delay risk detection
- [ ] Add budget overrun risk detection
- [ ] Add missing daily log reminders
- [ ] Auto-create suggested tasks from daily logs
- [ ] Auto-create suggested RFIs/issues from daily logs
- [ ] Add receipt/invoice extraction
- [ ] Add document Q&A
- [ ] Add spec-to-scope/RFP workflow
- [ ] Add bid leveling assistant
- [ ] Add warranty/support AI assistant

## Phase 8: Reporting And Executive View

Goal: help owners and PMs see the business clearly.

- [ ] Add company dashboard
- [ ] Add active jobs health score
- [ ] Add portfolio budget variance
- [ ] Add portfolio schedule risk
- [ ] Add open change order report
- [ ] Add unpaid invoice / pending bill report
- [ ] Add crew/vendor performance reporting
- [ ] Add export to CSV/PDF
- [ ] Add saved report views

## Phase 9: Product Hardening

Goal: make the app dependable enough for real customers.

- [ ] Add automated tests for core API routes
- [ ] Add Playwright smoke tests for main flows
- [ ] Add database seed data for development
- [ ] Add migration rollback/verification process
- [ ] Add audit log table
- [ ] Add record-level activity tracking
- [ ] Add error monitoring
- [ ] Add performance checks for large job lists
- [ ] Add mobile viewport QA pass
- [ ] Add role-based QA matrix
- [ ] Add backup/export strategy
- [ ] Add deployment checklist

## Future Permission Depth

Goal: once the job and budget modules are more fully built out, allow admins to control exactly which parts employees can see or change.

- [ ] Define job visibility sections such as client info, address, contract value, internal notes, contacts, schedule snapshot, logs, documents, and activity
- [ ] Define budget visibility sections such as contract amount, cost codes, estimates, committed costs, actual costs, vendor names, invoices/bills, change orders, profit/margin, and reports
- [ ] Add section-level permission fields or a role policy JSON model
- [ ] Update admin UI to manage section-level permissions without becoming cluttered
- [ ] Apply section-level filtering in server queries and client UI
- [ ] Add QA matrix for each role and permission combination

## Immediate Next Work Queue

Start here unless we intentionally reprioritize.


## Product Principle

Do not try to clone every competitor screen. Build the daily contractor operating loop:

Lead/job -> estimate/budget -> schedule/tasks -> daily log/photos -> change order/actuals -> client/sub communication -> AI summary/risk dashboard.
