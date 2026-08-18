# BuildOS Launch Plan — Aug 18 → Aug 31, 2026

Goal: **JDC runs on BuildOS starting September 1.** Field crew (Jason, Cane) run their entire day on the mobile PWA. Office (August, Lisa) run the business on the desktop web app. BuilderTrend stays alive in read-only parallel for the first two weeks of September as a safety net, then gets cancelled.

This plan is based on a code audit done 2026-08-18, not the ROADMAP checkboxes. Where the docs and the code disagree, this file reflects the code.

---

## Audit: where the app actually stands

### Built and launch-ready (verified in code)
- Lead pipeline → estimate builder (4,600-row cost book, markup, autosave, lock) → printable proposal → public accept/decline with signature → auto-creates job + budget + starter schedule
- Budget lines, actuals, POs, bills w/ approval workflow, change orders w/ homeowner approval link + PDF, job profitability report
- **Billing milestones / draw schedule** — API + table component exist (ROADMAP table saying "not built" is stale)
- **QuickBooks integration is real code, not a stub** — OAuth connect/callback/status + sync of job→customer, estimate, actual→bill (ROADMAP "stub only" is stale). Needs verification, not building.
- Daily logs with photos (compressed on upload), AI Log mode (camera + voice → DeepSeek summary), inline traditional log sheet, weather auto-fetch
- Documents + OneDrive/SharePoint browser with per-file visibility; contacts; vendors; time clock with GPS fields; admin/permissions screens
- Mobile foundation: 5-tab nav, MobileHome launchpad, JobPickerSheet, PWA manifest + icons, Fixer chat panel
- BT export data on disk (`bt-export/jobs.json`, `contacts.json`, per-job data) + time clock import script (`npm run bt:import`)

### Launch gaps (verified in code)
| # | Gap | Evidence |
|---|-----|----------|
| 1 | **No camera capture** — every photo input opens the gallery | zero `capture=` hits in `src/`; AiLogModal's getUserMedia is the only camera path |
| 2 | **No cross-job "My Tasks" on mobile** — Tasks tab routes to `/jobs/{id}/tasks`, forcing a job pick | `layout.tsx:219`; TaskList.tsx already has mobile cards to reuse |
| 3 | **No offline tolerance** — a dropped connection on a job site loses the log | `localStorage` used only by ActiveJobContext |
| 4 | **Zero notification infrastructure** — nobody finds out when a proposal is signed, a CO is approved, or a log is missing | zero hits for "notification" in `src/` |
| 5 | **No time clock manager layer** — ShiftsClient shows totals but no per-employee week rollup, no bulk approve | ShiftsClient.tsx |
| 6 | **Only 18 files have a mobile branch** — Budget, Estimates, Vendors, Profitability, Admin render desktop tables on phones | grep `md:hidden` |
| 7 | **One automated test** (`tests/budget.spec.ts`); SMOKE_TESTS.md is manual | tests/ |
| 8 | Microsoft/SharePoint env keys missing locally; Vercel env parity unverified | `.env.local` |

### Strategy calls this plan makes
- **Crew doesn't need every module on mobile.** Gap #6 is solved for launch by *role-gating*, not by mobilizing 30 screens: crew roles see Today / Jobs / Log / Tasks / Clock / More and nothing else. Money screens stay desktop-only until after launch.
- **Notifications ship minimal but real:** a `notifications` table + in-app bell + Discord webhook posts (bot token already in env — this is the cheapest reliable channel and it feeds the future Hermes `#alerts` design). Email/SMS come later.
- **QuickBooks does not block launch.** Verify in sandbox during Week 2; production connect can trail launch by a week. Lisa keeps QB manual entry as today until sync is proven.
- **Hermes VPS / Discord agent platform, Apify price intelligence, homeowner portal are explicitly OUT of the launch window.** They resume in September.
- Klutch.ai's lesson for launch is scoped to what's shippable: Fixer visible and useful on every mobile screen (AI Log already shipped; add voice input + quick chips + morning brief as stretch).

---

## Week 1 — Aug 18–24: Finish the field experience (P0)

The crew must be able to run a full day — clock in, see tasks, log with photos, find the site — with one hand, on LTE, without training beyond 15 minutes.

### Day 1–2 (Mon–Tue)
- [ ] **Camera capture** — add `capture="environment"` photo path to `AddLogModal`, `LogPhotoUploader`, `MobileTraditionalLogSheet` (keep gallery as secondary option — crews also upload shots taken earlier). Test on a real Android + iPhone, not just Playwright. *(~½ day)*
- [ ] **Mobile My Tasks screen** — new `/tasks` page: my open tasks across all jobs, grouped Today / Overdue / Upcoming, tap-to-complete with optimistic update, pull-to-refresh. Reuse TaskList's mobile card branch. Point the Tasks tab here instead of the job picker. Add "blocked / need help" action that flags the task and (once #4 lands) notifies the PM. *(~1 day)*
- [ ] **Fix Tasks tab routing** on desktop unchanged; mobile goes to `/tasks`.

### Day 3 (Wed)
- [ ] **Offline-tolerant logs** — autosave log drafts (text + queued photos) to localStorage on every keystroke in all three log entry paths; on submit failure, keep the draft and show "saved on phone — will retry"; retry on reconnect/app open. This is draft persistence, not full offline sync — keep it simple. *(~1 day)*

### Day 4 (Thu)
- [ ] **Mobile job detail pass** — job header on phone gets: address with tap-to-open Google Maps directions, homeowner + contacts with tap-to-call / tap-to-text, status, and this week's schedule items. Back breadcrumb on every job sub-page. *(~½ day)*
- [ ] **One-tap time clock** — "Clock in to {active job}" single button with job pre-filled from context, live elapsed timer while clocked in, clock-out confirm. No manager UI on this screen. *(~½ day)*

### Day 5 (Fri)
- [ ] **Role-gate mobile navigation** — crew roles never see Budget/Estimates/Finance/Vendors/Admin/Profitability anywhere on mobile (nav, More page, job tabs, JobPickerSheet destinations). PM/Owner on a phone can still reach them (desktop tables are tolerable for occasional PM use). *(~½ day)*
- [ ] **Schedule read view on mobile** — verify ScheduleList's existing mobile branch covers: my week, per-job list. Fix rough edges only. *(~¼ day)*
- [ ] **Fixer polish (Klutch-style)** — voice input via keyboard mic + `webkitSpeechRecognition` fallback, persistent quick chips: "My tasks today", "What's overdue?", "Start a log", "Summarize this job". *(~½ day)*

### Weekend buffer / stretch
- [ ] Quick wins from MOBILE_UX plan: weather chip (`⛅ 71°/43°`), log list pagination, filter count badges
- [ ] **Field pilot #1 (Sat if anyone's on site, else Mon):** one crew member uses only BuildOS mobile for one real day. Log every friction point. This list drives Week 2 fixes.

---

## Week 2 — Aug 25–31: Office readiness, safety rails, cutover

### Day 6 (Mon)
- [ ] **Notifications v1** — `notifications` table (user_id, type, title, body, link, read_at) + helper that writes a row **and** posts to a Discord channel via existing bot token. Wire these events: proposal accepted/declined, CO signed, new lead created, task assigned to you, task flagged blocked, no daily log on an active job by 4pm (cron). In-app bell with unread count in both desktop header and mobile More/Home. *(~1 day)*

### Day 7 (Tue)
- [ ] **Time clock manager view** — per-employee weekly totals table, "clocked in now" card, multi-select + bulk approve, CSV export for payroll. Desktop-only. *(~1 day)*

### Day 8 (Wed)
- [ ] **Permissions QA matrix** — write the matrix (4 roles × modules × view/edit), then walk every route as each role on both viewports. **Hard requirement: a crew login can never see contract value, margin, bills, PO amounts, or profitability — including via API responses, not just hidden UI.** Fix everything found. *(~1 day)*

### Day 9 (Thu)
- [ ] **Data readiness** — final BT import pass: jobs + contacts from `bt-export/`, time clock via `bt:import`, verify cost book row count, verify every *active* job has: correct status, PM, homeowner contact, budget (if job is money-tracked), schedule items. Archive dead jobs so the crew job picker is clean. *(~½ day)*
- [ ] **Env + deploy hygiene** — audit Vercel env vars vs `.env.local` (Microsoft/SharePoint keys are missing locally; confirm what production actually has); document every required var in README. *(~¼ day)*
- [ ] **Error monitoring** — add Sentry (client + server) so launch-week bugs are seen, not reported by angry texts. *(~¼ day)*

### Day 10 (Fri)
- [ ] **QuickBooks sandbox verification** — run connect → sync job → sync bill against QB sandbox; fix what breaks; write the go/no-go note. Production connect is **allowed to trail launch** — do not force it. *(~½ day)*
- [ ] **Smoke test pass** — run SMOKE_TESTS.md manually on: desktop Chrome, real Android, real iPhone. Add Playwright specs for the three money paths: estimate→proposal→accept→job, CO→sign→budget update, bill→approve. *(~½ day)*

### Weekend Aug 30–31 — Launch prep
- [ ] **Pilot #2: whole crew, one real day, BuildOS only.** BT open in a tab for comparison, not for entry.
- [ ] Fix pilot findings (this is what the buffer is for)
- [ ] Install PWA on every crew phone; 15-minute walkthrough per person (Today → Clock in → Log with photos → Tasks)
- [ ] Print the one-page cheat sheet (Log a day / Clock in / Find the site / Ask Fixer)
- [ ] Go/no-go against the checklist below

---

## Go/no-go launch checklist

Launch means crew stops entering data in BT. All must be true:

- [ ] Crew member can: clock in, see today's tasks, complete a task, create a log with camera photos, find the job address — each in under 30 seconds on a phone
- [ ] A log survives airplane mode: draft persists, syncs when signal returns
- [ ] Crew login shows zero financial data anywhere (UI **and** API)
- [ ] Proposal accept and CO signature fire a notification August actually receives
- [ ] Lisa can: enter a bill, approve it, see budget impact; run time clock weekly totals and bulk approve
- [ ] Every active job has correct status, PM, contacts, schedule
- [ ] Sentry is receiving events from production
- [ ] All three smoke platforms pass; money-path Playwright specs green
- [ ] BT is confirmed still accessible read-only for the parallel period

---

## Corrections backlog (existing features — fix as encountered, none block launch)

- ROADMAP stale claims: progress billing exists; QB is not a stub; TaskList *does* have a mobile branch (the gap was tab routing, fixed in Week 1)
- Proposal email delivery + reminders (today: manual link sharing) — first week of September
- Starter schedule from accepted proposal is phase-based and coarse — refine templates
- Documents not linked to tasks/logs/COs — September
- Recent production-bug pattern (Outlook 500, hydration, manifest proxy) suggests missing env vars in Vercel are a recurring failure mode — the Day 9 env audit is the fix
- Weather stored as raw text → parse to structured chip (quick win)

---

## September fast-follow (priority order, from competitor research)

1. **Fixer daily brief** — 7am summary per user: my jobs, tasks, schedule, flags (the single most visible Klutch-style win; Discord channel already exists for delivery)
2. **Budget overrun + schedule risk alerts** into notifications
3. QuickBooks production cutover + sync status dashboard
4. Proposal email delivery, open tracking (proposal analytics à la Klutch lead intelligence)
5. Job activity feed + photo feed with before/during/after tags (CompanyCam pattern)
6. Docs ↔ tasks/logs/COs linking
7. Cost catalog assemblies + AI scope matching ("200 sqft bathroom" → pre-filled estimate)
8. Hermes agent platform (Phase 10a–g) — VPS is already running; resume here
9. Apify material price intelligence (Phase 5a)
10. Homeowner portal (visibility flags already exist on files/proposals — architecture is ready)

---

## Working agreement for the two weeks

- Mobile wins every tradeoff (per 2026-08-18 decision). Desktop changes limited to the manager/notification items listed.
- Ship daily; every implementation is committed and pushed to `main` (auto-deploys to Vercel).
- Anything not on this plan gets written down for September and **not built in August**.
