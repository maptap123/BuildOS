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

Goal: deploy Hermes Agent (Nous Research OSS) on a VPS as the single AI brain for the entire JDC business. Hermes has full read and write access to every part of the operation — the JDC app, QuickBooks, email, and SMS context from Android phones. Every employee talks to the same agent, either through the JDC app or Discord. All conversations are visible to ownership in Discord regardless of which channel was used.

### The Full Picture

```
                    ┌─────────────────────────────────┐
                    │       HERMES AGENT (VPS)         │
                    │    Nous Research OSS              │
                    │    Always-on, always aware        │
                    │    Model: OpenRouter (flexible)   │
                    └───────────────┬─────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                           │
         ▼                          ▼                           ▼
  JDC Platform              QuickBooks API            Email (Gmail / Outlook)
  Read + Write              Financial data            Read + Draft replies
  Jobs, schedule,           P&L, invoices,            Lisa's client emails
  budget, tasks,            payments, vendors         Incoming inquiries
  change orders,
  daily logs, docs
         │
         ▼
  SMS Context (Tasker)
  Jason, Lisa, August,
  Cane — sub + vendor
  threads synced on
  app open
```

**Interfaces:**
- **JDC app** — in-app chat panel, available on every page
- **Discord** — direct message or channel; Hermes Agent has native Discord support
- **Visibility** — every conversation (app or Discord) is mirrored to a per-user Discord channel so ownership sees everything in one place

---

### Role Capability Tiers

| Capability | Field Worker | Project Manager | Owner / CEO |
|---|---|---|---|
| My tasks for today | ✅ | ✅ | ✅ |
| Job schedule / milestones | ✅ | ✅ | ✅ |
| Daily log — read | ✅ (own) | ✅ (all) | ✅ (all) |
| Daily log — create | ✅ | ✅ | ✅ |
| Mark task complete | ✅ | ✅ | ✅ |
| Punch list status | ✅ | ✅ | ✅ |
| Job address / site info | ✅ | ✅ | ✅ |
| Draft SMS reply to sub | ✅ | ✅ | ✅ |
| Budget summary | ❌ | ✅ | ✅ |
| Actual costs / bills | ❌ | ✅ | ✅ |
| Purchase orders | ❌ | ✅ | ✅ |
| Contract value | ❌ | ✅ | ✅ |
| QuickBooks data | ❌ | ✅ | ✅ |
| Draft client email | ❌ | ✅ | ✅ |
| Change order financials | ❌ | ✅ | ✅ |
| Lead pipeline | ❌ | ✅ | ✅ |
| Markup / margin | ❌ | ❌ | ✅ |
| Profitability report | ❌ | ❌ | ✅ |
| Portfolio / all jobs summary | ❌ | ❌ | ✅ |
| Employee info / rates | ❌ | ❌ | ✅ |

---

### Phase 10a — VPS + Hermes Agent Deployment

Goal: get Hermes Agent running on a VPS and connected to the JDC tool dispatcher.

**Progress note (2026-05-21):** Hermes Agent is running on a Hostinger KVM VPS via Hostinger Docker Manager. Current access during setup is the raw VPS IP/port, and the working model provider is OpenAI Codex OAuth with `gpt-5.5`. Detailed handoff notes live in `HERMES_PROGRESS.md`.

Completed so far:
- [x] Provisioned Hostinger KVM VPS
- [x] Deployed Hermes Agent via Hostinger Docker Manager
- [x] Completed Hermes setup with OpenAI Codex OAuth
- [x] Verified chat works with `gpt-5.5`
- [x] Switched terminal backend to Local after Docker backend could not run `docker version`
- [x] Verified tool execution by creating `hello.txt`

Immediate next steps:
- [ ] Take Hostinger VPS snapshot/backup while install is clean
- [ ] Configure HTTPS/domain or a no-cost hostname path; currently using raw IP + port
- [ ] Wire Hermes to the existing JDC `/api/agent` endpoint

- [ ] Provision a VPS — Railway, Render, or DigitalOcean droplet ($6–12/mo)
- [ ] Clone and deploy Nous Research Hermes Agent on the VPS
- [ ] Set up OpenRouter account + API key — gives access to all major models without locking to one provider
- [ ] Configure Hermes Agent with OpenRouter as the model provider
- [ ] Wire Hermes to the existing JDC `/api/agent` endpoint as its primary tool source — Hermes calls JDC tools to read and write app data
- [ ] Add `HERMES_JDC_API_KEY` env var on VPS — authenticates Hermes's calls to the JDC tool dispatcher
- [ ] Verify Hermes can: list jobs, get schedule, update a task, create a daily log — all via natural language
- [ ] Configure role-aware system prompt — inject user name, role, active jobs, today's date on each conversation start
- [ ] Agent refuses out-of-tier requests gracefully ("that info is restricted to management")

### Phase 10b — Discord Server + Visibility Architecture

Goal: set up the Discord server that serves as both a user interface and the owner's full visibility layer.

- [ ] Create JDC Discord server: "JDC Hermes"
- [ ] Create per-user channels: `#hermes-jason`, `#hermes-lisa`, `#hermes-august`, `#hermes-cane`
- [ ] Create `#hermes-alerts` channel — proactive briefings, overrun alerts, schedule risks post here
- [ ] Connect Hermes Agent Discord bot to the server
- [ ] Configure Hermes so each Discord channel maps to the correct user identity and role tier
- [ ] Owner (August) has read access to all channels — full visibility across all 4 users
- [ ] Individual users can only see their own channel
- [ ] Test end-to-end: Jason asks a question in `#hermes-jason`, Hermes responds with real JDC data

### Phase 10c — In-App Chat + Discord Mirror

Goal: employees can use the JDC app to talk to Hermes, and those conversations appear in Discord automatically.

- [ ] Add `src/components/hermes/HermesChatPanel.tsx` — slide-in chat panel available on every page
- [ ] Wire chat panel to `/api/hermes/chat` route — forwards message to VPS Hermes Agent, streams response back
- [ ] Auto-inject active job context — if user is on the Oak Street job page, Hermes knows the job without being told
- [ ] Mirror every in-app conversation to the corresponding Discord channel in real time
- [ ] Add quick-action chips: "My tasks today", "What's overdue?", "Summarize this job"
- [ ] Add persistent chat trigger button in main nav

### Phase 10d — Email Integration

Goal: Hermes can read emails and draft replies on behalf of Lisa and other team members.

- [ ] Complete Microsoft 365 / Gmail OAuth flow — store encrypted tokens per user
- [ ] Add `read_emails` tool to Hermes — pulls recent inbox threads, filterable by sender, job name, or date range
- [ ] Add `draft_email_reply` tool — Hermes composes a reply based on email thread + relevant JDC job data; user reviews and sends manually
- [ ] Add `search_emails` tool — find all emails mentioning a specific job, client, or sub
- [ ] Wire email context into system prompt for Lisa's role — on conversation start, inject summary of unread emails ("You have 2 unread client emails from this week")
- [ ] Email data is scoped per user — Lisa's emails are not visible to Jason's Hermes session

### Phase 10e — QuickBooks Integration

Goal: Hermes can answer financial questions and cross-reference JDC job data with QuickBooks actuals.

- [ ] Complete QuickBooks OAuth connection flow — store encrypted tokens
- [ ] Add `get_qb_job_costs` tool — pulls actual costs for a job from QuickBooks by customer/project
- [ ] Add `get_qb_vendor_balance` tool — outstanding balance owed to a specific vendor
- [ ] Add `get_qb_cash_position` tool — overall company cash, AR aging, AP aging
- [ ] Add `get_qb_profit_loss` tool — P&L summary for a date range
- [ ] Cross-reference tool — compare JDC budget vs QuickBooks actuals for a job and surface variance
- [ ] QuickBooks data is owner/PM tier only — field workers cannot access it

### Phase 10f — SMS Context Bridge (Tasker)

Goal: Jason, Lisa, August, and Cane can ask Hermes to reference or draft replies to their real Android SMS conversations with subs and vendors — without changing how anyone texts.

**How it works:**
- Tasker ($3.99) runs on each user's Android phone: trigger = JDC app opened
- Tasker reads recent SMS threads, filters to contacts in the JDC contacts table, POSTs to `/api/hermes/sms-sync`
- Hermes stores threads per-user; on conversation start, injects a summary of recent sub/vendor activity
- User asks "draft a reply to Mike the plumber" — Hermes reads the thread, checks the job schedule, writes the reply; user copies and sends from their phone

**Key decisions:**
- 4 users: Jason, Lisa, August, Cane — each gets a unique API token in their Tasker config
- Data is fully isolated per user — no cross-visibility even in admin
- Only contacts in the JDC contacts table are synced — not the full inbox
- Hermes drafts replies, never sends — user always has final control
- 30-day rolling retention; older threads pruned automatically

**Tasks:**
- [ ] Add `hermes_sms_context` Supabase table — (user_id, contact_phone, contact_name, messages JSONB, thread_date, synced_at) with row-level security
- [ ] Add `/api/hermes/sms-sync` POST endpoint — authenticates via per-user Bearer token, upserts thread rows
- [ ] Add token generation for Jason, Lisa, August, Cane in Settings → Hermes → SMS Context — generate once, revocable
- [ ] Add contact phone matching — threads matched to contacts table by phone number
- [ ] Add `read_sms_thread` tool to Hermes — pull full thread with a specific contact
- [ ] Add `draft_sms_reply` tool — compose reply based on thread + job data
- [ ] Wire SMS summary into Hermes system prompt — "Jason has 3 recent sub threads: Mike (plumber, 2h ago), Dave (electrician, yesterday), Carlos (framing, 3 days ago)"
- [ ] Add Tasker setup guide page in app — step-by-step for each of the 4 users
- [ ] Add 30-day auto-pruning via Supabase cron

**Tasker profile:**
- Trigger: App launched — `build-os-eight.vercel.app`
- Action 1: Query SMS inbox — last 30 days, known contacts only
- Action 2: HTTP POST to `/api/hermes/sms-sync` with Bearer token + thread JSON
- Action 3: Flash "Hermes synced" toast (optional)

### Phase 10g — Proactive Intelligence

Goal: Hermes initiates contact — employees don't have to ask, it tells them what they need to know.

- [ ] Morning briefing at 7am — posted to each user's Discord channel: their jobs for the day, open tasks, schedule milestones, any budget flags
- [ ] Owner Monday morning portfolio post to `#hermes-august`: all active jobs, total committed vs budget, unsigned change orders, cash position from QuickBooks
- [ ] Budget overrun alert — when any job's forecast exceeds budget by >10%, post alert to `#hermes-alerts` and the relevant PM's channel
- [ ] Schedule risk alert — when a schedule item is overdue with incomplete predecessors, flag to PM
- [ ] Missing daily log reminder — if no log filed for an active job by 4pm, post reminder to field worker's channel
- [ ] Unsigned change order reminder — daily nudge if a CO has been pending client signature for more than 3 days

---

**Infrastructure cost estimate:**
- VPS: ~$6–12/mo (Railway or DigitalOcean)
- OpenRouter API: ~$30–100/mo depending on model choice and message volume
- Supabase: within existing plan
- Discord: free
- Tasker: $3.99 one-time per phone (4 phones = ~$16 total)

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

## Mobile Experience Strategy

**One codebase. Two completely different experiences.**

JDC Platform runs as a single Next.js app but renders a fundamentally different UI depending on the device. This is not responsive tweaking — it's two distinct products sharing the same data layer and API routes.

### Philosophy
- **Mobile = field tool.** Built for a phone in one hand on a job site. The primary users are Jason, Cane, and August in the field. Every screen is optimized for speed, large touch targets, camera access, and offline-tolerant patterns. Feature set is deliberately narrow: the things field workers actually need every hour.
- **Desktop = management tool.** Built for an owner or PM at a desk. Full data density, all modules visible, sidebar navigation, tables, charts, and the full feature set.
- **How the split works:** The `(dashboard)/layout.tsx` detects viewport width and renders either the `<MobileLayout>` or `<DesktopLayout>` wrapper. Pages and components can further branch with `useMobileLayout()` hook. Mobile-specific pages live in `src/components/mobile/`. Desktop-specific pages are untouched.

### Mobile Nav (5 items max)
| Tab | What it is |
|-----|-----------|
| Today | My jobs for today, tasks due, schedule milestones — the field worker's morning dashboard |
| Jobs | Job list, tap into a job for site address, contacts, and quick actions |
| Log | Create daily log with photos, weather, and notes — camera-first flow |
| Tasks | My open tasks across all jobs — tap to complete |
| More | Access to Documents, Time Clock, Hermes chat, Settings |

### Mobile-Only Features
- Camera-first photo upload directly in log creation
- Large tap targets throughout (min 44px)
- Swipe gestures on task/log cards
- Offline-tolerant log drafts (saves locally, syncs on reconnect)
- Quick action floating button for the most common task: "Start a Log"

### Desktop-Only Features
- Full sidebar job panel
- All 13+ navigation tabs
- Budget/financial views with tables and charts
- Admin panel
- Profitability reports
- Vendor and contact management tables
- Lead pipeline kanban

---

### Mobile Sprint 1 — Foundation ✅ DONE (2026-05-22)

**Architecture note:** The split is done with Tailwind CSS breakpoints (`md:hidden` / `hidden md:block`), not hooks or shell components. No `useMobileLayout` hook needed — Tailwind handles it cleanly. Desktop code is untouched.

**Files built/changed:**
- `src/components/mobile/MobileHome.tsx` — navy/gold launchpad: Hermes hero button, 4-tile action grid, Today's Tasks, This Week schedule
- `src/components/mobile/LogModePicker.tsx` — bottom sheet: Traditional vs AI Log mode (AI = BETA stub, Phase 2)
- `src/app/(dashboard)/more/page.tsx` — full mobile nav: Management, Job Tools, Settings sections + sign out
- `src/hooks/useCurrentUser.ts` + `src/app/api/me/profile/route.ts` — personalized greeting
- `src/app/(dashboard)/layout.tsx` — 5-tab mobile bottom nav (Home, Jobs, Tasks, Time Clock, More); tabs with no job open `JobPickerSheet` with destination intent routing
- `src/app/(dashboard)/jobs/page.tsx` — dual render: mobile gets `<MobileHome>`, desktop gets existing dashboard
- `src/components/jobs/JobPickerSheet.tsx` — added `onSelect` callback prop for destination intent
- `src/components/logs/LogClient.tsx` — auto-opens Add Log modal when `?newLog=1` is in URL

**Verified working (Playwright, 390×844):**
- ✅ Hermes button → inline chat panel
- ✅ Daily Log → LogModePicker → Traditional → job picker → `/jobs/{id}/logs?newLog=1` → Add Log modal auto-opens
- ✅ Schedule (no job) → job picker → `/jobs/{id}/schedule`
- ✅ Time Clock → `/time-clock`
- ✅ Documents → `/documents`
- ✅ Jobs nav tab → job picker sheet
- ✅ Tasks nav tab (no job) → job picker with `tasks` intent → `/jobs/{id}/tasks`
- ✅ More tab → `/more` page

### Mobile Sprint 2 — Field Tools (next)
- [ ] Build mobile Tasks screen — my tasks list, tap to complete, pull to refresh
- [ ] Add camera capture to photo upload (not just file picker)
- [ ] Add weather auto-fetch on log creation (already in desktop log form, needs mobile hook)
- [ ] Add offline draft storage for logs (localStorage → sync on reconnect)
- [ ] AI Log mode (Phase 2) — camera + voice → Hermes writes the log (Klutch AI pattern)

### Mobile Sprint 3 — Hermes on Mobile
- [ ] Voice-to-text input for Hermes (native mobile keyboard mic)
- [ ] Hermes AI Log — open camera, talk + snap photos, Hermes writes the log entry on submit
- [ ] Quick chips persistent across sessions: "My tasks today", "What's overdue?", "Start a log"

---

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

- [x] **[Mobile Sprint 1]** ✅ Done — MobileHome launchpad, LogModePicker, More page, 5-tab nav, Hermes chat, all routing verified in Playwright
- [ ] **[Mobile Sprint 2]** Camera capture on photo upload (mobile file picker currently opens gallery, need `capture="environment"`)
- [ ] **[Mobile Sprint 2]** Weather auto-fetch on mobile log creation
- [ ] **[Mobile Sprint 2]** Offline draft storage for logs
- [ ] **[Mobile Sprint 2]** AI Log mode — camera + voice → Hermes writes the log (Klutch AI pattern, currently BETA stub)
- [ ] **[Price Intelligence]** Decide which retailers to include, then start Phase 5a (Apify client + price_cache schema + HD scraper)
- [ ] Add job activity feed
- [ ] Phase 7: AI daily brief + budget overrun risk detection (Sprint D)
- [ ] **[Hermes]** Provision VPS, deploy Nous Research Hermes Agent, connect to OpenRouter, wire to `/api/agent` JDC tool dispatcher (Phase 10a)
- [ ] **[Hermes]** Set up Discord server with per-user channels, connect Hermes bot, verify end-to-end with real JDC data (Phase 10b)
- [ ] **[Hermes]** Build in-app chat panel + Discord mirror so app conversations appear in Discord (Phase 10c)
- [ ] **[Hermes]** Complete QuickBooks + email OAuth, add Hermes read/draft tools (Phase 10d + 10e)
- [ ] **[Hermes]** Add `hermes_sms_context` table + `/api/hermes/sms-sync` endpoint + Tasker setup for Jason, Lisa, August, Cane (Phase 10f)

---

## Product Principle

Do not try to clone every competitor screen. Build the daily contractor operating loop:

Lead/job → estimate/budget → schedule/tasks → daily log/photos → change order/actuals → client/sub communication → AI summary/risk dashboard.
