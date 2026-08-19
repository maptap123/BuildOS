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
- [x] **Camera capture** — added `capture="environment"` "Take Photo" (primary) + "Gallery" (secondary) to `AddLogModal`, `LogPhotoUploader`, `MobileTraditionalLogSheet`. *(code done 2026-08-18 — real Android + iPhone test still pending)*
- [x] **Mobile My Tasks screen** — new `/tasks` page (`MyTasksClient`): open tasks across all active jobs via `/api/tasks?scope=open`, grouped Overdue / Today / Upcoming / No due date, Mine/All filter (defaults to Mine when tasks are assigned), tap-to-complete with optimistic update, pull-to-refresh, "blocked / need help" flag (PATCH → status blocked; PM notification lands with Week 2 #4).
- [x] **Fix Tasks tab routing** — mobile Tasks tab + More page + MobileHome "view all" now go to `/tasks`; desktop unchanged.

### Day 3 (Wed)
- [x] **Offline-tolerant logs** — `src/lib/logDrafts.ts`: text autosaved to localStorage on every keystroke in all three log paths (AddLogModal, MobileTraditionalLogSheet, AiLogModal review); on network failure the draft is marked pending with a "saved on this phone — will send when online" banner; `LogDraftSync` (mounted in dashboard layout) retries on app open + `online` event and toasts when synced. Photos stay attached in-screen (not persisted to localStorage by design).

### Day 4 (Thu)
- [x] **Mobile job detail pass** — address now opens Google Maps *directions* deep link; homeowner phone + every job contact get tap-to-call and a Text (sms:) button; mobile back breadcrumb on every job sub-page via the job layout. This-week schedule card already existed.
- [x] **One-tap time clock** — verified already built (context-prefilled clock-in, live timer, clock-out confirm, no manager UI on mobile); Clock In button now shows the active job name.

### Day 5 (Fri)
- [x] **Role-gate mobile navigation** — More page now hard-gates Budget/Estimates/Finance/Profitability/Vendors/Leads behind office-level access (admin or budget/finance view) so permission fallbacks can't leak money screens to crew; bottom nav was already field-only; job-detail money cards were already permission-gated. (API-level enforcement is Week 2 Day 8.)
- [x] **Schedule read view on mobile** — verified: ScheduleList's list view has a complete mobile card branch (status, trade, dates, progress); MobileHome + job detail cover "my week". No changes needed.
- [x] **Fixer polish (Klutch-style)** — `useSpeechInput` hook (webkitSpeechRecognition) wired as a mic button in both Fixer panels; persistent quick chips ("My tasks today", "What's overdue?", "Start a log", "Summarize this job") above the input; Fixer float button now shows on every mobile screen; fixed leftover "Hermes" label in the mobile panel header.

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
- [ ] Sentry is receiving events from production *(DSN still not configured anywhere — needs a human to create the Sentry project; see Day 9 item)*
- [x] Money paths verified against the live app 2026-08-19: estimate→proposal→accept→job and CO→sign both pass via Playwright (4/4), bill→approve verified manually end-to-end through a real logged-in session (was the one path still needing a human — closed without one). Real Android/iPhone smoke platforms still open, can't be done from this machine.
- [ ] BT is confirmed still accessible read-only for the parallel period

---

## Corrections backlog (existing features — fix as encountered, none block launch)

- ROADMAP stale claims: progress billing exists; QB is not a stub; TaskList *does* have a mobile branch (the gap was tab routing, fixed in Week 1)
- Proposal email delivery + reminders (today: manual link sharing) — first week of September
- Starter schedule from accepted proposal is phase-based and coarse — refine templates
- Documents not linked to tasks/logs/COs — September
- Recent production-bug pattern (Outlook 500, hydration, manifest proxy) suggests missing env vars in Vercel are a recurring failure mode — the Day 9 env audit is the fix
- Weather stored as raw text → parse to structured chip (quick win)
- **Fixed 2026-08-19, real launch blocker:** `user_permissions` had a self-referential RLS policy since the very first migration, causing intermittent `infinite recursion detected in policy` 500s on budget/schedule/tasks/PO/WO endpoints for any user — see `SMOKE_TEST_RESULTS.md` addendum and migration `038_fix_user_permissions_recursion.sql`. Not caught by the Day 8 permissions audit because it isn't a scoping bug, and non-deterministic enough that earlier smoke passes happened to land on the endpoints that didn't trip it.

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
