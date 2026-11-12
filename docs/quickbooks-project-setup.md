# QuickBooks project setup (local implementation)

## Behavior

- Lead conversion saves/reuses one BuildOS job, then asks the office to select an existing QuickBooks project or explicitly confirm creation of a new one. Direct New Job, status-menu activation, and Edit Job activation offer the same setup.
- Connected Systems exposes **Change QuickBooks project** (or **Set up QuickBooks project**) to users with `admin.can_manage`. New-job/activation users without that permission can leave setup for an office administrator.
- Linking an existing project requires no external-write confirmation: it only writes BuildOS. Creation names the homeowner and new project in a required checkbox; changing either clears confirmation.
- **Set up later** continues without changing the current connection. Existing job/form state survives failed setup. Conversion and QBO setup are deliberately separate: a failed QBO call must not create a second BuildOS job.
- Accounting `Customer.Job=true` is only a generic sub-customer/job indicator. Existing project choices require `IsProject=true`, active state, and the exact active top-level homeowner relationship, all reread on submission. Missing/ambiguous identity fails closed.

## IDs and accounting compatibility

`jobs.qb_customer_id` already drives cost/billing mapping as the accounting **CustomerRef cost target**. It remains the selected project's accounting Customer ID; `qb_project_id` is that same accounting ID for actual projects only. The homeowner lives in the new `qb_parent_customer_id`; GraphQL project identity is stored separately as `qb_graphql_project_id` when creation supplies it. Do not substitute a GraphQL ID into accounting CustomerRef filters.

The transactional save replaces/rejects obsolete QuickBooks links and writes the jobs summary together. `qb_link_version` supplies optimistic concurrency. A project already linked to a different BuildOS job is rejected. Database triggers and both auto-match entry points protect explicit choices from later automatic matching. Existing mappings have version zero and are not backfilled or rewritten by these migrations.

## Required rollout prerequisites (NOT applied by this task)

1. Review/apply both migrations before releasing code:
   - `20261112120000_quickbooks_project_setup.sql`
   - `20261112121000_atomic_lead_job_seed.sql`
2. Existing-project selection uses the accounting connection and requires no new external write permission.
3. Real project creation requires the Intuit premium **Projects API** entitlement (Silver tier or higher), Projects API activation for this app, and OAuth consent for `project-management.project` plus `com.intuit.quickbooks.accounting`.
4. Set `QB_PROJECT_SCOPE_ENABLED=true` only after app access is approved. The reconnect URL then requests the Projects scope. Complete a reconnect for the intended company; an existing accounting-only token does not gain a new scope by changing a flag.
5. Set `ENABLE_QB_PROJECT_CREATION=true` separately to enable the narrow create path. `ENABLE_QB_WRITES` does NOT unlock accounting writes. Flags are operator assertions, not proof of entitlement; HTTP/GraphQL errors still fail closed with a scope/access message.
6. All other accounting POST/PUT/PATCH/DELETE calls remain rejected by the original GET-only client. No generic GraphQL write endpoint is exposed.

Creation uses only fixed `projectManagementCreateProject`, then independently reads the returned `projectManagementProject`. It next requires a unique accounting `Customer.IsProject=true` mapping with the same name and parent before linking. Some companies/API versions may not expose that accounting mapping immediately (or at all). In that case the job is NOT marked linked: refresh/select an existing verified project or investigate the mapping. No fallback creates a generic Customer/sub-customer.

The durable claim is keyed by realm/homeowner/normalized name. It is committed before a mutation and never automatically released after timeout, denial, or process failure, because the remote outcome may be uncertain. Repeated calls cannot issue another mutation for that key. Search/select existing projects to recover. If none exists, an office operator must verify the remote outcome before an explicitly scoped claim repair; do not delete claims or rename projects simply to bypass this safeguard.

## Primary evidence checked November 12, 2026

- Intuit official get-started page: `https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/get-started` (premium entitlement, scope, endpoints).
- Official `IntuitDeveloper/SampleApp-Project-NodeJS`, revision `2505d73ccb4531b42e067fd7072aede5262e4aee`: `graphql/project/createProject.js`, `graphql/project/getProjectById.js`, `routes/project.js`, README scope section.
- Official `IntuitDeveloper/SampleApp-EmployeeCompensation-DotNet`, revision `5efe9a7789f6cc55f1ea4eb5214516c2ee9ee69c`: README project queries and `Customer.IsProject=true` mapping description. This mapping is a verification requirement, not an assumption that every project appears in every accounting query.

## Isolated verification

Run `npm.cmd run test:qbo-projects`, targeted ESLint, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.

Tests bundle the actual Next handlers and React components, substituting only dependencies/network responses. SQL runs against in-memory PGlite fixtures, never Supabase. Tests cover permission failures, arbitrary/wrong-parent/non-project IDs, confirmation, fixed GraphQL mutation and readback, denied scope, disabled flags, duplicate claims/reuse, stale saves, atomic rollback, old-link rejection, auto-match protection, atomic lead/job seed/retries, and setup across all office UI entry points. PGlite serializes requests; it is not a multi-connection live PostgreSQL load test. The accepted-proposal budget/schedule import remains its existing separate follow-up process; the new transaction guarantees the job shell and lead backlink, not all later starter-record imports.

Evidence logs and browser screenshot are under `.qbo-logs/` in the isolated worktree; that generated directory is ignored by git and ESLint. No real QBO/BuildOS records, OAuth grants, app flags, production schema, deployment, or remote branches are changed by this task.
