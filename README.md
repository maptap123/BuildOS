# BuildOS

BuildOS is JDC Construction's internal operating system for running remodeling jobs from lead through closeout. It is being built to fully replace Buildertrend for JDC first, with the option to become a contractor-facing product later. BuildOS also borrows the best ideas from tools like CompanyCam where they improve the field workflow.


## Product Language and Launch Direction

- **Official product name:** BuildOS.
- **Positioning:** internal-first for JDC; possible contractor product later.
- **Replacement goal:** fully replace Buildertrend for JDC over time, not just fill gaps around it.
- **Primary launch priority:** make mobile extremely usable for Crew. August and Lisa are expected to use the full desktop web version most heavily.
- **AI assistant branding:** user-facing app copy should say **Fixer** (for example, "Talk to Fixer"). Existing technical route/file names may still use `hermes` until a separate code-naming decision is made.
- **Homeowner portal:** deep-future item after internal launch; public links for estimates/contracts/change orders are enough for near-term homeowner-facing workflows.

### Core Terms

| Use this term | Meaning |
|---|---|
| Homeowner | The person/company paying for the work. Avoid client/customer in user-facing copy unless there is a specific reason. |
| Job | Active work record. |
| Lead | Early sales/opportunity stage before it becomes a job. |
| Estimate | Homeowner-facing pre-sale price/scope. |
| Proposal | Polished homeowner-facing estimate package. |
| Contract | Signed after the homeowner agrees to the estimate. |
| Budget | Internal/PM spend plan for managing the job. |
| Change Order | Added or changed work after contract signing. |
| Daily Log | Daily field update, including work notes and photos. |
| Crew | JDC field workers. |
| Subcontractor | Official term for companies/people hired to perform part of the work; "sub" is acceptable casually. |
| Vendor/Supplier | Companies JDC buys materials or services from. |

### Permissions Direction

All jobs are generally visible internally, but features and sensitive money information must be controlled by role/person/module. Regular Crew may see different tools than Project Managers or Owner/Admin users.

Main internal roles:

- Owner/Admin
- Office/Admin
- Project Manager
- Crew

### Daily Log Photo Direction

Crew should generally upload photos through Daily Logs. Internal users such as August, Lisa, and Jason may also upload standalone job-folder/job-feed photos. Long term, photo handling should support simple Daily Log upload, a CompanyCam-style job photo feed, date/location organization, and before/after groupings.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database + Auth | Supabase (PostgreSQL + Auth) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| UI | React 19, Tailwind CSS v4, Lucide icons |
| Language | TypeScript |

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- A Supabase project
- An Anthropic API key

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root. Every variable the app actually reads (verified by
grepping `process.env.*` across `src/` and `scripts/` — this list is the source of truth, not
the old shorter one below):

```env
# Core — required for the app to boot at all
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-side only, never expose to client>

# AI — Fixer chat, AI Log Mode, estimate assistance
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=<used by AI Log Mode's field-note summarizer>

# Hermes (Discord bridge + VPS agent)
DISCORD_BOT_TOKEN=<bot token, used for thread creation and the notifications-v1 Discord alerts>
DISCORD_HERMES_CHANNEL_ID=<the shared #jdc-hermes channel id>
DISCORD_HERMES_WEBHOOK_URL=<webhook for posting into that channel — NOT set in local .env.local today; confirm it exists in Vercel prod or Hermes thread creation will fail>
DISCORD_ALERTS_CHANNEL_ID=<optional — separate channel for notifications-v1 alerts; falls back to DISCORD_HERMES_CHANNEL_ID if unset>
HERMES_JDC_API_KEY=<long random bearer token for the VPS Hermes agent>
HERMES_JDC_USER_ID=<public.users id Hermes should act as>

# Notifications v1 cron (src/app/api/cron/log-check)
CRON_SECRET=<random secret — Vercel Cron sends it as "Authorization: Bearer $CRON_SECRET"; without it the endpoint is unauthenticated>

# QuickBooks Online
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_ENVIRONMENT=sandbox   # or production

# Apify (material price intelligence — September scope, but the client reads this today)
APIFY_API_TOKEN=

# Microsoft / SharePoint (documents integration) — MISSING from local .env.local as of this
# audit (2026-08-19); confirm whether Vercel production actually has these set, since the repo's
# recurring "Outlook 500 error" bug pattern matches a missing-env-var failure mode
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
SHAREPOINT_SITE_URL=

# Sentry (added Week 2 Day 9) — every field below is optional and no-ops safely if unset,
# but without them launch-week errors won't be visible anywhere
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=              # same DSN, read on the server; NEXT_PUBLIC_SENTRY_DSN is the browser copy
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=       # only needed for source map upload at build time, not at runtime

# App URL (used to build absolute links in notification payloads posted to Discord,
# and for every account-invite link — see USER_INVITES.md)
NEXT_PUBLIC_APP_URL=https://app.jdcplatform.com

# Outbound email (account invites). Unset = fall back to Supabase's built-in mailer,
# which sends as "Supabase Auth" and is capped near 2 messages/hour. See USER_INVITES.md
RESEND_API_KEY=
EMAIL_FROM=BuildOS — JDC Construction <noreply@jdcremodeling.com>
EMAIL_REPLY_TO=      # optional; where replies to an invite should land
```

`SUPABASE_SERVICE_ROLE_KEY` is used only in server-side API routes via the admin client. It bypasses Row Level Security so that permission enforcement can be done in application code.
`HERMES_JDC_API_KEY` lets the external Hermes VPS call `POST /api/agent` without a browser session. `HERMES_JDC_USER_ID` must be an active JDC user with the module permissions Hermes is allowed to use.

**Referenced in code comments but not yet actually read by any `process.env` call** (QuickBooks
OAuth connect/callback are still stubbed — see Day 10 plan): `QB_REDIRECT_URI`,
`QB_TOKEN_ENCRYPTION_KEY`, `PRICE_CACHE_TTL_HOURS`. Don't assume setting them does anything yet.

### 3. Run the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`. Unauthenticated requests redirect to `/login`.

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/           # Authenticated shell + all feature pages
│   │   ├── jobs/              # All-jobs dashboard (cross-job agenda panels)
│   │   │   └── [id]/          # Job detail, edit, tasks, schedule, budget, logs
│   │   └── admin/             # User management and permissions
│   └── api/                   # Server-side API routes (all permission-gated)
│       ├── jobs/              # CRUD — create, list, get, update, archive, delete
│       ├── tasks/             # CRUD + comments
│       ├── schedule/          # CRUD + predecessor relationships + iCal export
│       ├── budget/            # Budget lines (cost codes)
│       ├── actuals/           # Actual cost entries
│       ├── change-orders/     # Change orders with approval workflow
│       ├── logs/              # Daily field logs
│       ├── photos/            # Log photo upload (Supabase Storage)
│       ├── dashboard/agenda/  # Cross-job dashboard feed
│       ├── admin/users/       # User invite and permission management
│       ├── ai/                # Claude-powered log summarisation + estimating
│       ├── agent/             # AI agent with structured job/task/schedule tools
│       └── integrations/      # QuickBooks + Outlook placeholders
├── components/
│   ├── jobs/                  # DesktopJobPanel, JobFilterPanel, AddJobModal, JobStatusBadge
│   ├── budget/                # Budget UI components
│   ├── tasks/                 # Task board components
│   ├── schedule/              # Schedule components
│   ├── logs/                  # Daily log components
│   ├── admin/                 # Admin panel components
│   └── ui/                    # Shared UI primitives (Button, Input, etc.)
├── hooks/                     # Client data hooks: useJobs, useTasks, useAgenda, etc.
├── lib/
│   ├── supabase/              # client.ts, server.ts, admin.ts, middleware.ts
│   ├── permissions/           # usePermissions hook (client-side)
│   └── ai/                    # claude.ts (Anthropic SDK client)
├── proxy.ts                   # Next.js middleware — session cookie refresh
└── types/index.ts             # Shared TypeScript interfaces for all DB tables
```

---

## Data Model

### Core Tables

| Table | Purpose |
|---|---|
| `jobs` | Projects — top-level entity. Status flow: lead → presale → active → closed → archived |
| `tasks` | To-dos scoped to a job. Priority: low / medium / high / urgent |
| `schedule_items` | Schedule milestones with start/end dates, trade, % complete, predecessor support |
| `schedule_item_predecessors` | FS / SS / FF / SF predecessor links with optional lag_days |
| `budget_lines` | Cost-code-level budget with original, revised, committed, forecast values |
| `actuals` | Individual cost entries linked to budget lines |
| `change_orders` | Additive / deductive / neutral change orders |
| `daily_logs` | Field daily logs — weather, manpower, work performed, delays, safety notes |
| `log_photos` | Photos attached to daily logs (files in Supabase Storage) |
| `documents` | Files attached to jobs, tasks, logs, or budget lines |
| `user_permissions` | Per-user module permissions (see below) |
| `integration_settings` | QuickBooks / Outlook / Google Calendar connection state |
| `notifications` | In-app bell rows — see [Notifications](#notifications) below |

### Permission Modules

Each user has one row per module in `user_permissions`. The full current list (16 modules —
`finance`/`profitability`/`estimates`/`photos`/`vendors` were added to the DB's module CHECK
constraint by migration 026, which existed in this repo for a while but was only actually applied
to the live database on 2026-08-19 during the Week 2 permissions audit):

| Module | What it gates |
|---|---|
| `jobs` | View, create, edit, delete jobs (contract value/margin additionally require `budget`) |
| `leads` | Sales pipeline — office-only |
| `contacts` | Job-site contacts; intentionally inherits `jobs.can_view` so crew keep tap-to-call/text |
| `vendors` | Subcontractor/vendor directory — office-only |
| `budget` | Budget lines, actuals, change orders, and the money fields on `jobs` |
| `finance` | Finance dashboard |
| `profitability` | Job profitability report |
| `estimates` | Estimate builder, proposals |
| `schedule` | View and manage schedule items |
| `tasks` | View and manage tasks and comments |
| `logs` | View and create daily logs and photos |
| `photos` | Standalone job photo feed (outside daily logs) |
| `documents` | View and upload documents |
| `time_clock` | Clock in/out; `can_manage`-adjacent admin bypass covers shift approval — see [PERMISSIONS_MATRIX.md](./PERMISSIONS_MATRIX.md) for the default-allow exception here |
| `admin` | User management, permission management — `can_manage=true` bypasses every other module gate everywhere, server-side |
| `ai` | Fixer chat, AI Log Mode summarization, and `/api/agent` |

All API routes enforce these flags server-side via `src/lib/permissions/server.ts`'s
`hasModulePermOrAdmin()` (or an inline equivalent) — never rely on the client-side
`usePermissions()` hook alone, it only controls what the nav shows. See
[PERMISSIONS_MATRIX.md](./PERMISSIONS_MATRIX.md) for the intended role bundles and a record of
what was found broken in the Week 2 Day 8 audit. The `SUPABASE_SERVICE_ROLE_KEY` admin client is
used for permission lookups; all data reads/writes after the permission check also use the admin
client.

---

## Key Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Production build (runs TypeScript and lint checks) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run bt:import` | Import Buildertrend time clock data from the live BT session (see `.bt-session/`) |
| `npm run bt:import:dry` | Same, without writing — prints what would change |
| `npm run bt:import:file` | Same import, from a saved `scripts/bt-shifts-raw.json` instead of a live session |
| `npm run bt:import:file:dry` | Dry-run of the file-based import |

---

## Auth and Middleware Convention

Supabase Auth handles login and session management.

**Important:** This project uses `src/proxy.ts` (exports a `proxy()` function) as the Next.js middleware entry point for session cookie refresh. Do **not** create a `middleware.ts` file at the project root — having both causes a Next.js crash.

---

## Dashboard Agenda Panels

The `/jobs` dashboard shows four real-time cross-job panels from `GET /api/dashboard/agenda`:

| Panel | Data |
|---|---|
| Past Due | All overdue tasks across active jobs |
| Due Today | All tasks due today across active jobs |
| This Week | Schedule items overlapping the current week |
| Team Activity | Latest 8 daily log entries company-wide |

Panels respect module-level `can_view` permissions and show a friendly message for missing access.

---

## AI Features

| Endpoint | Description |
|---|---|
| `POST /api/ai` | Daily log summarisation and estimate assistance via Claude |
| `POST /api/agent` | Conversational agent with tools to query jobs, tasks, schedule, budget, and logs |

Both require the `ai` module `can_view` permission. `/api/agent` also accepts `Authorization: Bearer <HERMES_JDC_API_KEY>` for the VPS Hermes bridge and applies permissions from `HERMES_JDC_USER_ID`.

---

## Notifications

`notifications` table + in-app bell (desktop header, mobile header) + a Discord post via the
existing bot token — see `src/lib/notifications/`. Wired into: proposal accepted/declined, CO
signed/rejected, new lead, task assigned, task flagged blocked, and a weekday 4pm America/New_York
cron (`vercel.json` → `/api/cron/log-check`, requires `CRON_SECRET`) that flags any active job
with no daily log yet today. Recipients default to the job's `project_manager_id`, falling back
to every user with `admin.can_manage` if unset.

---

## Error Monitoring

Sentry (`@sentry/nextjs`) is wired via Next.js 16's native `instrumentation.ts` /
`instrumentation-client.ts` conventions (not the older `sentry.*.config.ts`-only pattern) —
see `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`,
`src/sentry.edge.config.ts`, `src/app/global-error.tsx`, and the `withSentryConfig` wrap in
`next.config.ts`. Everything no-ops safely when `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` are unset,
which is the case in local dev and was the case everywhere until this was added — **a Sentry
project still needs to be created and its DSN/org/project/auth-token set in Vercel** before
launch-week errors actually show up anywhere; this can't be done from this environment (requires
a Sentry account login).

---

## Deployment

Standard Next.js deployment. Recommended: Vercel.

1. Push to GitHub and link the repo in Vercel
2. Set every variable listed in [Configure environment variables](#2-configure-environment-variables) above in the Vercel dashboard (Project → Settings → Environment Variables) for the Production environment. That section is the authoritative list — it's generated from what the code actually reads, not maintained by hand here.
3. Add the Vercel Cron entry (already committed in `vercel.json`) for `/api/cron/log-check`; set `CRON_SECRET` so the endpoint isn't publicly callable.
4. Deploy

As of this audit (2026-08-19) this repo's env-var parity between local `.env.local` and Vercel
production has **not** been directly verified — this session's Vercel CLI session wasn't
authenticated (`vercel login` requires an interactive browser flow this environment can't run).
Before launch, someone with dashboard access should run `vercel env ls production` (or check the
dashboard directly) and diff it against the list above — pay particular attention to the
Microsoft/SharePoint and Sentry vars, which are the two groups most likely to be missing in prod.

For a staging environment create a separate Supabase project and use its keys.

---

## Buildertrend Data

Historical Buildertrend export data lives in `bt-export/`. It was imported into Supabase during initial setup. Re-import scripts are in `scripts/` if needed.
