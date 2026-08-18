# BuildOS Mobile UX Improvement Plan
## Mobile-First Web Platform — Updated August 2026

---

## Product Strategy

**One codebase. Two genuinely different experiences. Mobile gets built right first.**

This is not responsive tweaking of a desktop app, and it is not a desktop app with a mobile fallback. Mobile and desktop are two distinct products that share the same Supabase data layer and API routes — different navigation, different screens, different feature sets, each designed for its own user.

- **Mobile = field tool.** Field crew (Jason, Cane, August in the field) live on phones. A phone in one hand on a job site: large tap targets, card layouts, camera-first flows, minimal typing. Deliberately narrow — the things field workers need every hour, nothing else.
- **Desktop = management tool.** Owner or PM at a desk (August and Lisa). Full data density, all modules, sidebar navigation, tables, charts, admin, reporting.
- **Sequencing: mobile first, to completion.** Mobile is the priority build target and has to be *right* before desktop work resumes. Desktop is not being abandoned or downgraded — it is a first-class experience that comes second in build order.
- **When a shared component forces a tradeoff, mobile wins**, and desktop gets its own branch rather than compromising the phone experience.
- **No separate native app is planned.** A dedicated Expo/React Native crew app remains a possible future option, but it is not the plan and no roadmap item should be deferred to it.

> **History:** A May 2026 revision of this document declared the web app desktop-first with field work deferred to a future native app. **That direction was reversed in August 2026.** Field-crew items that were parked for a hypothetical native app are folded back into this roadmap (see *Field Crew Backlog* below) and are in scope for the web app.

**How the split is implemented:** Tailwind breakpoints only — `md:hidden` for mobile-only, `hidden md:block` for desktop-only. There is no `useMobileLayout` hook and no `<MobileLayout>`/`<DesktopLayout>` shell component. Mobile-specific components live in `src/components/mobile/`.

---

## Roadmap

### Priority 1 — Jobs List Page (HIGH, ~2 days)

The job switcher is a modal — not a real page. PMs need a proper jobs list.

**Solution:**
- Add `/jobs/list` as a first-class page (accessible from the current nav)
- **Table/card layout** with: job name, homeowner, status badge, PM, last activity, contract value
- **Saved views** — save filter presets by name
- **"+ New Job"** button prominent in header
- Keep the modal switcher for quick-switching *within* a job context
- **List/Map toggle** — map pins colored by job status

---

### Priority 2 — Filter System Overhaul (HIGH, ~2 days)

Status chips only. No saved presets. No filter count badge.

**Solution — filter panel (sidebar on desktop):**
- Saved preset dropdown (name/save/delete presets)
- Keywords search
- Status (multi-select chips)
- Project Manager
- Date range (Created, Start, Target Completion)
- Job Type
- Lead Source
- Tags
- **Filter badge** on the filter icon showing applied count
- Apply to: Jobs List, Daily Logs, Contacts, Tasks

---

### Priority 3 — Daily Log Improvements (HIGH, ~2 days)

Weather is raw text, no per-card actions, only shows 10 at a time.

**Solution:**
- **Weather chip**: Parse weather string into `⛅ 71° / 43°` display with icon
- **Per-card actions**: `...` overflow → Edit / Share / Print / Delete
- **Full pagination**: "Showing 1–20 of 75" with load more
- **Log detail page**: Full-screen log with all photos, weather, comments thread
- **Social bar**: Reaction (👍) + comment count (💬) — PMs and field crew can acknowledge logs
- **User avatar chip**: Initials circle + name, consistent with Contacts

---

### Priority 4 — Time Clock Manager View (HIGH, ~3 days)

No manager view. No totals. No bulk approvals. Field worker simple clock-in is fine; add the admin layer.

**Solution (manager/admin view):**
- **"Clocked In Now" card** at top: list of who's on the clock, which job, how long
- **This Week totals**: Per-employee hour summary table
- **Shift list**: Date / Employee / Job / Hours / Status (Pending/Approved)
- **Bulk approve**: Multi-select + "Approve Selected"
- **Map tab**: Pins showing where each employee clocked in (GPS)
- **Cost codes**: Tag shifts with cost categories

---

### Priority 5 — Job Detail Improvements (MEDIUM, ~1 day)

No back nav, no financial summary, no color, no related lead link.

**Solution:**
- Add `← Back to Jobs` breadcrumb in header
- Add **job color dot** (tap to change, 8-color palette)
- Add **financial summary strip**: `$142,000 contract · $38,200 budget remaining`
- Add **"View Proposal"** link if a proposal exists for this job
- Add **"View Lead"** link if job was converted from a lead

---

### Priority 6 — Future Features: Homeowner Portal & Lead Intelligence (MEDIUM–LOW, ongoing)

Differentiators that BT does poorly:

**Homeowner-facing (from Houzz Pro):**
- **Homeowner Selection Portal** — homeowner logs in, makes finish selections (tile, cabinet, fixture) from presented options. Replaces email chains. `/portal/[token]/selections`
- **Photo Albums** — organize job photos into albums by phase. Homeowner can view + add inspiration images.
- **Progress Photos** — before/after slider for homeowner-facing job updates.
- **Review Collection** — after job close, auto-send review request via SMS/email. Collect Google/Houzz link + internal rating.

**Lead intelligence (from Clutch.ai):**
- **Lead Source Tracking** — tag each lead with source (Referral, Google, Houzz, etc.). Dashboard shows revenue by source.
- **AI Lead Scoring** — Fixer scores lead quality based on project type, budget, timeline, location.
- **Automated Follow-up** — Fixer sends SMS follow-up after X days of no response.
- **Proposal Analytics** — track when homeowner opened proposal, time spent, sections read.

**Feature parity with BT:**
- **Warranty Tracking** — `/jobs/[id]/warranties` — log warranties with expiration dates and vendor contacts
- **Homeowner Updates** — weekly progress posts visible to homeowner in their portal
- **Submittals** — track product submittals sent to homeowner for approval
- **Selections** — structured selection tracking (Option A vs B vs C, homeowner picks one)

---

## Quick Wins (Can ship this week)

1. **Parse weather string into icon + hi/lo format** in daily log cards
2. **Add "← Back" breadcrumb** on all job sub-pages
3. **Add filter count badge** on filter buttons
4. **Add job color dots** — 8 color options, stored per job
5. **Show "Clocked in: X people" badge** on the Time Clock nav item when anyone is active
6. **Full pagination** on daily logs list

---

## Design System Notes

Keep what's working:
- **Navy `#1a2744` + Gold `#b8922a`** — this is our identity
- **Card-based layouts** on light `#f5f0e8` background — warm, premium
- **Rounded corners + subtle shadows** on cards
- **Gold as primary CTA** — consistent, recognizable

Improvements:
- Add **avatar chips** (initials circles) consistently — we have them in Contacts but not in logs or jobs
- Add **status pills** as a consistent component (Active = green, Presale = blue, Closed = gray)
- Add **count badges** on nav items and filter buttons
- Add **split buttons** for actions with sub-options

---

## Field Crew Backlog (in scope for this web app)

These items were parked in May 2026 for a hypothetical native app. With the mobile-first decision they are back in scope here, and should be built as mobile branches in the existing Next.js app.

**Navigation:**
- 5-item bottom nav: Dashboard · Jobs · Logs · Clock · More
- "More" drawer with categorized links
- Global "+" FAB for quick-add (new log, clock in, new task)
- Breadcrumb on every sub-page

**Field Crew Time Clock:**
- One-tap "Clock In to [Job]" with job pre-filled from context
- Live timer when clocked in
- "Take a break" secondary action
- Simple, glanceable UI — no manager complexity on this device

**Daily Log Creation (field-focused):**
- Quick log from job context — one tap, camera opens, log creates
- Inline photo upload from camera roll or live shot
- Weather auto-populated from GPS location

**Jobs List (field view):**
- Card layout: job name, address, status — nothing else
- Map view with driving directions tap-to-launch
- No table/saved views — field crew just needs "what am I working on today"

**Implementation notes:**
- Build these as `md:hidden` mobile branches / components in `src/components/mobile/`, against the existing API routes — no new backend work required.
- PWA install (manifest + icons) is already shipped, so the phone experience can be home-screen launched today.
- A native Expo/React Native client sharing the same Supabase project stays on the table as a *later* option, but nothing on this roadmap waits for it.
