# JDC Platform

Internal construction management platform — a focused replacement for BuilderTrend built on Next.js 16, Supabase, and Claude AI.

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

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-side only, never expose to client>
ANTHROPIC_API_KEY=sk-ant-...
```

`SUPABASE_SERVICE_ROLE_KEY` is used only in server-side API routes via the admin client. It bypasses Row Level Security so that permission enforcement can be done in application code.

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

### Permission Modules

Each user has one row per module in `user_permissions`:

| Module | What it gates |
|---|---|
| `jobs` | View, create, edit, delete jobs |
| `budget` | View and manage budget lines, actuals, change orders |
| `schedule` | View and manage schedule items |
| `tasks` | View and manage tasks and comments |
| `logs` | View and create daily logs and photos |
| `documents` | View and upload documents |
| `admin` | User management, permission management |
| `ai` | Access to AI summary and agent endpoints |

All API routes enforce these flags server-side. The `SUPABASE_SERVICE_ROLE_KEY` admin client is used for permission lookups; all data reads/writes after the permission check also use the admin client.

---

## Key Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Production build (runs TypeScript and lint checks) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

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

Both require the `ai` module `can_view` permission.

---

## Deployment

Standard Next.js deployment. Recommended: Vercel.

1. Push to GitHub and link the repo in Vercel
2. Set environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
3. Deploy

For a staging environment create a separate Supabase project and use its keys.

---

## BuilderTrend Data

Historical BuilderTrend export data lives in `bt-export/`. It was imported into Supabase during initial setup. Re-import scripts are in `scripts/` if needed.
