# JDC Platform — Product Roadmap

Living document for building JDC Platform into a serious Buildertrend / JobTread / Klutch AI competitor.

---

## The Complete Contractor Workflow (BT Parity Map)

```
LEAD INTAKE          ESTIMATING          JOB EXECUTION           CLOSEOUT & REPORTING
────────────────────────────────────────────────────────────────────────────────────
Lead captured    →   Estimate built  →   Budget set up      →   Punch list complete
Lead qualified   →   Markup applied  →   Schedule active    →   Final invoice sent
Site visit notes →   Proposal PDF    →   Daily logs / photos→   QB reconciliation
Follow-up log    →   Client signs    →   Tasks / subs       →   Job profitability
CRM pipeline     →   Convert → Job   →   Change orders      →   Portfolio report
                                     →   Bills / actuals    →
                                     →   Progress billing   →
```

---

## What You Have vs. What BT Has

| Stage | BT Capability | JDC Status | Gap |
|-------|--------------|------------|-----|
| **Lead Intake** | Lead pipeline, source tracking, follow-up history | ✅ Built | — |
| **Estimating** | Estimate builder, cost catalog, assemblies | ✅ Built | Assemblies / AI scope matching remain |
| **Proposal** | PDF + e-signature + link | ✅ Built | Email delivery / reminders remain |
| **Convert → Job** | Estimate becomes budget + schedule | ✅ Built | Starter schedule is phase-based and should be refined |
| **Budget setup** | Phases, cost codes, budget lines | ✅ Built | Phase grouping, cost code catalog |
| **Schedule** | Gantt + milestones + subs | ✅ Built | Client-visible milestones |
| **Daily logs** | Photos, weather, manpower | ✅ Built | Mobile flow, weather helper |
| **Tasks / punch list** | My tasks / all tasks / punch list tab | ✅ Built | — |
| **Change orders** | Draft → client approve → PDF | ✅ Built | — |
| **Purchase orders** | PO to vendor, linked to budget line | ✅ Built | — |
| **Bills / actuals** | Bill entry, approval, QB sync | ✅ Built | QB sync (Phase 4) |
| **Progress billing** | Draw schedule, invoice to client | Not built | Not in roadmap yet |
| **Job closeout** | Final invoice, warranty status | ✅ Built | Final invoice generation |
| **Job profitability** | Contract vs budget vs actual vs forecast | ✅ Built | — |
| **Documents** | File center, upload, job-linked | ✅ Built | Connect to tasks/logs/COs |
| **Contacts** | Client/sub directory | ✅ Built | Show on job detail panel |
| **QB sync** | Bills, invoices, payments bidirectional | Stub only | Phase 4 |
| **Portfolio report** | Multi-job budget health | Not built | Phase 8 |

---

## The Three Biggest Gaps

**1. Lead Intake → Estimate → Job (core loop built)**
BT's killer feature is this funnel. JDC now has the estimate builder UI, printable proposal, public client accept/decline link, and accepted proposal → job + budget + starter schedule conversion. The next lift is polish: assemblies, email delivery, better schedule templates, and AI-assisted scope matching.

**2. Bills / Purchase Orders / Progress Billing (the money middle)**
Budget lines and actuals exist but there's no way to track *commitments* (POs to subs/vendors) or *billing to the client* (draw schedule). This is the core of job cost control. BT users live here daily.

**3. Job Profitability Report (the finish line)**
The whole workflow is pointless without the closing report: contract value → revised contract (after COs) → budget → committed (POs) → actual (bills paid) → forecast → variance → margin %. This is what the owner reads at job end.

---

## JDC-Specific Advantage

The **4,600-row cost book** is already in the DB. BT users build estimates from scratch or import CSVs. Surfacing that cost book in an estimate builder with AI-assisted scope matching ("I need to remodel a 200 sqft bathroom" → Claude pre-populates likely line items with costs from the book) gives JDC something BT doesn't — and it directly converts to a budget on job creation. That's the wedge that makes this platform worth switching to.

---

## Recommended Build Order (Sprints)

### Sprint A — Close the Revenue Loop (Phase 5 first) — DONE
1. ✅ Lead pipeline view (kanban: New → Contacted → Proposal → Won → Lost)
2. ✅ Lead detail: contact info, project notes, status, follow-up log
3. ✅ Estimate builder: pulls from cost book, groups by phase, sets markup
4. ✅ Proposal PDF generation + "Accept" button → auto-creates job + budget lines
5. ✅ Lead source tracking on jobs

### Sprint B — Strengthen Job Cost Control (Phase 3) — DONE
6. ✅ Purchase orders: create PO → link to budget line → mark committed
7. ✅ Bills: enter bill → link to PO or budget line → approval status (pending/approved/paid)
8. ⬜ Progress billing / draw schedule: client-facing invoice milestones
9. ✅ Improved budget summary: Contract / Revised / Budget / Committed / Actual / Forecast / Variance

### Sprint C — Close the Loop on Completion — DONE
10. ✅ Punch list: task type = "punch" with its own tab/filter
11. ✅ Job closeout status: move from Active → Warranty → Closed with completion checklist
12. ✅ Change order PDF + client approval link
13. ✅ Job profitability report: the final financial summary per job

### Sprint D — Better Than BT — NOT STARTED
14. ⬜ AI receipt extraction: photo → actual cost entry (Claude Vision)
15. ⬜ AI daily brief: morning summary of every job's status
16. ⬜ Budget overrun risk alerts
17. ⬜ Natural language search across jobs

### Sprint E — Complete the Revenue Loop (remaining Sprint A items) — DONE
18. ✅ Estimate builder UI (pulls from 4,600-row cost book already in DB)
19. ✅ Proposal PDF generation + client accept flow
20. ✅ Convert accepted proposal → job + budget lines + starter schedule
21. ✅ Show contacts on job detail panel (quick win)

| Sprint | Maps to Phase | Status |
|--------|---------------|--------|
| Sprint A | Phase 5 (Sales, Estimating, Proposals) | Done — CRM, estimates, proposals, client accept, and conversion built |
| Sprint B | Phase 3 (Money and Commitments) | Done |
| Sprint C | Phase 3 + Phase 2 (Field OS) | Done |
| Sprint D | Phase 7 (AI Advantage) | Not started |
| Sprint E | Phase 5 remainder | Done |
| Sprint F | Phase 10 (Hermes Agent Platform) | Not started |

---

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
- [x] Estimate builder with cost catalog search, phase grouping, markup, and totals
- [x] Printable proposal / browser Save as PDF flow
- [x] Public proposal accept/decline flow with typed signature
- [x] Accepted proposal conversion into job, approved budget lines, and starter schedule milestones
- [x] All top-level tabs remain clickable and prompt for job selection when needed

---

## Phase 1: Make The Core Trustworthy

Goal: turn the current app from a promising prototype into something stable enough to build on every day.

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

- [x] Add visible Documents module to navigation
- [x] Build job document/file center
- [x] Add file upload to Supabase storage
- [x] Add file preview/download links
- [ ] Connect documents to jobs, logs, tasks, budget lines, and change orders
- [x] Build contacts/client directory UI
- [x] Show contacts on job detail
- [x] Add contact create/edit/delete flows
- [x] Add log photo upload
- [x] Show log photos in daily log feed
- [x] Add photo captions
- [ ] Add mobile-friendly daily log creation flow
- [ ] Add weather capture helper
- [ ] Add safety notes / incidents structure
- [ ] Add manpower by trade
- [ ] Add job activity feed
- [ ] Add comments/mentions on job records
- [ ] Add notifications foundation

## Phase 3: Money And Commitments

Goal: make budgets, change orders, costs, and commitments reliable enough for real job control.

- [x] Improve budget summary: contract, revised contract, budget, committed, actual, forecast, variance
- [ ] Add budget phase grouping
- [ ] Add cost code catalog
- [x] Add purchase orders table
- [x] Add purchase orders UI
- [ ] Add work orders table
- [ ] Add work orders UI
- [ ] Add vendor directory
- [x] Add bills/invoices table
- [x] Add bill approval status workflow
- [x] Link actual costs to purchase orders and bills
- [x] Add change order approval workflow
- [x] Add change order PDF generation
- [x] Add change order client signature status
- [x] Add client-facing change order approval link
- [x] Add job profitability report
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

- [x] Add leads/CRM pipeline (kanban: New → Contacted → Proposal → Won → Lost)
- [ ] Add website contact form lead intake
- [ ] Add lead source for website contact form submissions
- [ ] Add lead notification when a new website inquiry comes in
- [x] Add lead source tracking
- [x] Add lead detail page with contact info, project notes, status, and follow-up history
- [x] Add convert lead to job/project flow
- [x] Add estimate table
- [x] Add estimate builder UI
- [ ] Add cost catalog assemblies
- [x] Add proposal builder / printable proposal view
- [x] Add proposal PDF generation via browser print / Save as PDF
- [x] Add proposal approval/signature flow
- [x] Convert accepted proposal into job, budget, and schedule
- [ ] Add bid requests
- [ ] Add vendor bid comparison / bid leveling
- [ ] Add basic takeoff placeholder workflow

### Material Price Intelligence (Apify)

Goal: let contractors look up live material prices from major retailers while building estimates, without leaving the platform.

**Phase 5a — Foundation**
- [ ] Add `price_cache` Supabase table (query, retailer, product_name, sku, price_cents, unit, url, store_number, zip_code, scraped_at)
- [ ] Add `materials_library` Supabase table (org-level saved materials with category, default unit, last known price + retailer)
- [ ] Add `src/lib/apify/client.ts` — Apify REST API wrapper (actor calls, error handling, timeouts)
- [ ] Add `src/app/api/materials/price-search/route.ts` — cache-first price lookup (24hr TTL, hits Supabase before calling Apify)
- [ ] Add `APIFY_API_TOKEN` and `PRICE_CACHE_TTL_HOURS` env vars
- [ ] Wire first retailer: **Home Depot** via `studio-amba/homedepot-scraper` (price + availability by ZIP)

**Phase 5b — Multi-Retailer + Estimate UI**
- [ ] Add **Lowe's** via `studio-amba/lowes-scraper`
- [ ] Fetch all configured retailers in parallel (`Promise.all`), merge and sort results by price
- [ ] Add `src/components/budget/MaterialPriceSearch.tsx` — search UI (query + ZIP, results table: retailer / product / price / unit / link)
- [ ] Wire "Add to estimate" from search results into `AddBudgetLineModal` (auto-fills unit cost + source URL)

**Phase 5c — Sherwin-Williams + Custom Actor**
- [ ] Build private Apify actor for **Sherwin-Williams** (Playwright-based: product name / SKU / price per unit / coverage)
- [ ] Add category-aware retailer routing — paint queries include SW; non-paint skips it to save credits
- [ ] Store SW color name/code on line items for purchase order reference

**Phase 5d — Intelligence Layer**
- [ ] Add nightly price refresh — re-scrape `materials_library` items not updated in 7+ days
- [ ] Add price change alerts — notify PM when a material moves >5% on an open estimate
- [ ] Keep append-only price history (enables "was $X last month" context + trend charts)
- [ ] Add per-org retailer toggles in admin — enable/disable which retailers are searched
- [ ] Add "cheapest option" auto-suggest — background scan of all estimate line items, flag potential savings

**Retailer candidates to evaluate (decide before Phase 5b):**
- 84 Lumber — contractor-focused, better lumber pricing than big box
- Ferguson — plumbing / HVAC
- Fastenal — fasteners / hardware
- Menards — if Midwest market is relevant

**Cost:** ~$29/mo Apify Starter at launch; ~$199/mo at high volume.

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

## Phase 10: Hermes — Agentic AI Platform

Goal: give every employee a single AI they can text or chat with that knows who they are, respects what they're allowed to see, and can both read and update job data in natural language — no app required for field workers, full in-app chat for office users.

### The Core Idea

Hermes is one Claude-powered agent accessible two ways:
- **SMS** — employees text a Twilio number from their phone. No app install. No login screen.
- **In-app chat** — same agent, same memory, same capabilities, embedded in the web platform.

The agent's responses are filtered by the user's role. A field worker asking "what's the markup on this job?" gets a polite refusal. A CEO asking the same thing gets the number, the margin, and a comparison to last quarter.

---

### Role Capability Tiers

| Capability | Field Worker | Project Manager | Owner / CEO |
|---|---|---|---|
| My tasks for today | ✅ | ✅ | ✅ |
| Job schedule / milestones | ✅ | ✅ | ✅ |
| Daily log — read | ✅ (own) | ✅ (all) | ✅ (all) |
| Daily log — create via text | ✅ | ✅ | ✅ |
| Photo upload via MMS | ✅ | ✅ | ✅ |
| Mark task complete | ✅ | ✅ | ✅ |
| Punch list status | ✅ | ✅ | ✅ |
| Job address / site info | ✅ | ✅ | ✅ |
| Budget summary | ❌ | ✅ | ✅ |
| Actual costs / bills | ❌ | ✅ | ✅ |
| Purchase orders | ❌ | ✅ | ✅ |
| Contract value | ❌ | ✅ | ✅ |
| Markup / margin | ❌ | ❌ | ✅ |
| Profitability report | ❌ | ❌ | ✅ |
| Portfolio / all jobs summary | ❌ | ❌ | ✅ |
| Change order financials | ❌ | ✅ | ✅ |
| Lead pipeline | ❌ | ✅ | ✅ |
| Employee info / rates | ❌ | ❌ | ✅ |

---

### Phase 10a — Agent Foundation

- [ ] Add `hermes_conversations` Supabase table — stores message history per user (user_id, role, channel: sms/app, messages JSONB, updated_at)
- [ ] Add `hermes_user_context` table — long-term memory per user (preferred job names, last asked topics, known preferences, last active job)
- [ ] Build role-aware Claude agent with tool definitions gated by role tier (field / pm / owner)
- [ ] Read tools: get_my_tasks, get_job_schedule, get_job_status, get_daily_logs, get_punch_list, get_budget_summary (pm+), get_profitability (owner only), get_all_jobs_health (owner only)
- [ ] Write tools: create_daily_log, mark_task_complete, add_task_note, upload_photo_from_url
- [ ] Add system prompt that injects: user's name, role, active jobs, today's date, and recent conversation summary
- [ ] Agent refuses out-of-tier requests gracefully ("that info is restricted to management — want me to flag it for your PM?")

### Phase 10b — In-App Chat Interface

- [ ] Add `src/components/hermes/HermesChatPanel.tsx` — slide-in chat panel available on every page
- [ ] Wire chat panel to `/api/hermes/chat` route (streams Claude responses)
- [ ] Show conversation history from `hermes_conversations` on open
- [ ] Add context-awareness: if user is on the Oak Street job page, Hermes auto-knows the active job
- [ ] Add quick-action chips: "My tasks today", "Log my hours", "What's overdue?"
- [ ] Add chat trigger button to main nav (persistent across all pages)

### Phase 10c — SMS Interface (Twilio)

- [ ] Add Twilio account + provision a dedicated phone number for Hermes
- [ ] Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` env vars
- [ ] Add `/api/hermes/sms` webhook route — receives inbound Twilio SMS, resolves user by phone number, calls agent, replies via Twilio
- [ ] Add phone number field to employee profiles + verification flow (send code, confirm)
- [ ] Handle MMS photo messages — download attached image, upload to Supabase storage, attach to daily log
- [ ] Handle unrecognized numbers gracefully ("This number isn't linked to a JDC account. Contact your admin.")
- [ ] Add SMS rate limiting per user (prevent runaway usage)

### Phase 10d — Persistent Memory

- [ ] Agent summarizes each conversation end and stores key facts in `hermes_user_context` (last job discussed, open items mentioned, preferences)
- [ ] On new conversation, inject prior context into system prompt ("Last time we spoke you were working on Oak Street — still on that job?")
- [ ] Agent learns job nicknames ("the church job" → maps to Calvary Baptist Renovation)
- [ ] Agent tracks recurring questions per role and surfaces them as suggestions
- [ ] Add admin UI to view/clear a user's Hermes memory

### Phase 10f — Admin Conversation Monitoring

Goal: give the system admin full visibility into every Hermes conversation across all employees — what was asked, what was returned, and when.

- [ ] Add admin-only `/admin/hermes` page — lists all employees with their last active channel (SMS/app), last message timestamp, and total message count
- [ ] Add conversation detail view — admin can click any employee and read the full message thread (both sides: what they asked and what Hermes replied)
- [ ] Add filters: by employee, by date range, by channel (SMS vs in-app), by job mentioned
- [ ] Add search across all conversations — find any message containing a keyword (e.g. "markup", "cost", "fired")
- [ ] Flag attempted permission violations — highlight any message where an employee asked for data outside their role tier and was refused (so you can see if someone is probing for info they shouldn't have)
- [ ] Show which tools Hermes called per message (e.g. get_budget_summary, create_daily_log) — gives a clear audit trail of what data was actually read or written
- [ ] Add export to CSV — full conversation history for any employee or date range
- [ ] Conversations are retained for 90 days by default; add configurable retention setting in admin
- [ ] Add activity summary widget on main admin dashboard: messages sent today, most active employee, jobs most discussed

### Phase 10e — Proactive Intelligence

- [ ] Morning SMS to field workers: "Good morning [Name] — you're on Oak Street today. 3 open tasks. Reply to log your start time."
- [ ] PM daily brief via SMS or in-app: budget at-risk jobs, overdue tasks, unsigned change orders
- [ ] Owner Monday morning portfolio summary: active jobs, total committed vs budget, open change orders value
- [ ] Alert when a field worker hasn't logged for a job day ("No log filed for Oak Street yesterday — want me to create one?")
- [ ] Budget overrun alert to PM+: "Lumber costs on Oak Street are 12% over budget line"

---

**Infrastructure cost estimate:**
- Twilio: ~$1/mo per number + ~$0.0079/SMS sent — negligible at launch
- Claude API: depends on message volume; budget ~$50–200/mo at active team size
- Memory storage: minimal Supabase rows

---

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

---

## Future Permission Depth

Goal: once the job and budget modules are more fully built out, allow admins to control exactly which parts employees can see or change.

- [ ] Define job visibility sections such as client info, address, contract value, internal notes, contacts, schedule snapshot, logs, documents, and activity
- [ ] Define budget visibility sections such as contract amount, cost codes, estimates, committed costs, actual costs, vendor names, invoices/bills, change orders, profit/margin, and reports
- [ ] Add section-level permission fields or a role policy JSON model
- [ ] Update admin UI to manage section-level permissions without becoming cluttered
- [ ] Apply section-level filtering in server queries and client UI
- [ ] Add QA matrix for each role and permission combination

---

## Immediate Next Work Queue

Start here unless we intentionally reprioritize.

- [x] Show contacts on job detail panel (quick win — contacts table exists, job_id is linked)
- [x] Add convert lead to job/project flow (Lead status = Won → auto-create job; accepted proposal → job + budget + schedule)
- [x] Add estimate builder UI (pulls from 4,600-row cost book already in DB)
- [ ] **[Price Intelligence]** Decide which retailers to include, then start Phase 5a (Apify client + price_cache schema + HD scraper)
- [x] Add proposal PDF generation + client accept flow
- [ ] Add mobile-friendly daily log creation flow
- [ ] Add job activity feed
- [ ] Phase 7: AI daily brief + budget overrun risk detection (Sprint D)
- [ ] **[Hermes]** Add `hermes_conversations` + `hermes_user_context` tables, role-aware agent, in-app chat panel (Phase 10a + 10b — start here before SMS)
- [ ] **[Hermes]** Add Twilio SMS interface + phone number verification on employee profiles (Phase 10c)

---

## Product Principle

Do not try to clone every competitor screen. Build the daily contractor operating loop:

Lead/job → estimate/budget → schedule/tasks → daily log/photos → change order/actuals → client/sub communication → AI summary/risk dashboard.
