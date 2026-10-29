# Employee Fixer: scoped durable backend

## Local implementation, not a deployment receipt

The former blanket hold is replaced by a durable employee research queue. Normal
questions run using current BuildOS module permissions and fixed physical SQL
column projections. Sensitive questions await one exact August decision. No
production migration, deployment, live business mutation or real SMS is performed
by these implementation tests. UI resumption and gateway/supervisor release are
separate coordinated changes owned by the parent release.

## Identity and data boundaries

- `auth.getUser().id` is the only requester identity. Active account + explicit
  `ai.can_view` are required; no missing-permission default grants. Neither model
  nor caller can supply another requester. No identify/phone onboarding.
- `users.phone` is an existing admin-managed delivery setting. Missing, malformed
  or duplicate-active phone mappings never block in-app questions. A normalized
  unique account phone is snapshotted at submission, re-read at claim and again
  immediately before SMS. Changing it cancels the old delivery, never retargets
  an already queued answer. The request's authenticated app result remains usable.
- The worker has seven read-only tools: job identity/status/dates/site, task
  title/status/priority/due date, schedule dates/trade/completion, dated log
  metadata, exact-job budget figures, exact-job approved/paid actual aggregate,
  and exact-person hourly/overtime rates. Unstructured private descriptions,
  notes, email/texts, credentials, banking and broad user rows are excluded.
- Jobs/tasks/schedule/logs each require their current module view permission.
  Budget and actuals require current budget view AND the exact request approval.
  Compensation requires current admin view + manage-users (matching source RLS)
  AND exact-person approval. August approval does not grant module permissions.
  Existing estimating AI+budget access is restored; it is not August-only.
- Personal email/texts and shell/browser/external tools are unavailable to ALL
  BuildOS Fixer users, including August. Approval cannot enable them. There is no
  QBO HTTP tool in this worker: actuals are the approved BuildOS records, not a
  promise of complete QuickBooks coverage. Existing QBO read-only policy is unchanged.
- General browser `/api/agent` access is denied, preventing an unscoped bypass.
  Existing service/SMS and estimate-lease paths remain separate. The new worker
  never receives their bearer credentials or uses the general gateway.

## Exact approval contract

Routing keywords are a convenience, never authorization. Submission freezes the
question, account, optional conversation and delivery snapshot. A direct sensitive
question gets an explicit category/tool list and exact resolved job IDs or person
ID before a notice is enqueued. Full stored job name/UUID and unique full person
name are supported. Ambiguous/missing subjects cannot silently broaden access;
ask a more specific new question rather than guessing or merging accounts.

If an operational question attempts a sensitive tool, the FIRST attempted exact
tool/category/record IDs become the held scope before the owner notice is created,
and the lease is invalidated. No sensitive data is retrieved. An approval resumes
only that frozen tool+record scope, not all financial tools. Once reviewed, scope
cannot be changed. A later different category/record or revoked base permission
holds the request again without disclosure; submit a new scoped question or have
August review the account's actual permissions. Approval never edits permissions.

Owner notices include server `full_name`, immutable requester UUID (duplicate-name
disambiguation), complete untrusted question and exact scope. Existing signed
Twilio original-form handling accepts ONLY APPROVE/DENY plus exact request UUID,
checks configured original external webhook URL, AccountSid, pinned August From,
pinned Fixer To and unique provider MessageSid. Bare YES never chooses a request.
The configured approver must be active, manage Admin, and have the pinned saved
August phone. Legacy verified-phone enrollment is no longer used by this flow.

The 30-minute request deadline is also the approval deadline. Do not treat a late
SMS or a timeout as consent. The retained foundation migration's old
`approved_waiting_for_secure_worker` records expire during the follow-up migration;
their original decision audit is retained and never converted into a broader grant.

## HTTP interfaces

- `POST /api/hermes/chat` (BuildOS cookie): `{message, conversationId?}`; maximum
  question 1,000 characters; conversation UUID optional. Optional UUID
  `Idempotency-Key` header deduplicates exact retries transactionally; reusing it
  for another user/question/conversation is rejected.
  SSE includes `queued {requestId,status,smsEnabled}`, compatible `delta {text}`,
  then `done {requestId}`. ACK says the app may be closed; promises a text only
  with configured SMS and a unique valid saved account phone.
- `GET /api/hermes/privacy-requests` (cookie): own sanitized ARRAY of
  `id,status,created_at,finished_at,progress,conversationId` plus `result` ONLY for
  completed requests still authorized at read time. No message, phone, lease,
  approval audit or raw held output. No shared history is fed into new research.
- `POST /api/hermes/privacy-worker`: Bearer `FIXER_PRIVACY_WORKER_KEY`, distinct
  from estimate worker, agent and dispatch keys, >=32 characters.
  `{action:"claim"}` -> `{job:null}` or `{job:{id,message,scope,lease_token,
  expires_at,tools}}`.
  `{action:"heartbeat"|"complete"|"fail"|"hold",id,lease,text}` -> `{saved:true}`;
  409 ends that lease. Text is <=20,000 characters. Heartbeat cannot publish raw
  model progress; the server stores safe fixed progress.
- `POST /api/hermes/privacy-tools`: Bearer
  `privacy.<request UUID>.<lease UUID>`, body `{tool,params}`. No long-lived bearer
  works here. The DB locks/rechecks lease, deadline, current account/modules,
  exact approval/tool/source/record scope BEFORE retrieval in the same operation.
  409 stops research; no substitute broad executeTool call is available.
- `POST /api/hermes/privacy-dispatch`: dedicated dispatch bearer; one owner notice
  claim per poll. Never accepts caller recipient/body. Foundation `sent` means
  provider acceptance of a notice, not proof of handset delivery.
- `POST /api/hermes/privacy-delivery`: same dedicated dispatch bearer; independent
  completion-answer outbox. No caller recipient/body/SID. Rechecks current profile
  before send; later polls safely GET known Twilio SIDs to reconcile accepted
  versus delivered/failed. Ambiguous/crashed sends become unknown and never resend.

## Durable DB state

Apply `20261028120000_fixer_privacy_review.sql` followed by
`20261028130000_fixer_private_worker.sql` transactionally as reviewed migrations.
All privacy tables/RPCs are service-only with RLS and no authenticated/anon grants.
The follow-up replaces decision/notice functions, adds worker/result/lease fields,
private read-attempt audit and a SEPARATE employee completion-delivery outbox.
No estimate-line migration/tool module is a dependency of this feature.

Statuses are queued/running/held/completed/failed/denied/expired/cancelled. Claim uses
SKIP LOCKED, 90-second leases and a fixed 30-minute deadline. Heartbeat every 20s;
read-only stale work is reclaimable with a NEW fenced lease. Identical completion
retry is idempotent; different result or stale credential is rejected. Revocation
is checked before each read, completion, status disclosure and notification.
Successful results and the completion outbox insert commit together. Read-attempt
audit contains tool + target IDs + allowed flag, not returned financial values.

Ordinary answers <=1,200 characters can be texted to the bound account phone;
longer or sensitive answers produce only a content-free sign-in notification.
The result remains in the authenticated app. Provider acceptance is not delivery:
completion outbox states are pending/sending/accepted/delivered/failed/unknown/
cancelled, with SID retained. Unknown sends need operator provider reconciliation,
not requeue. The remaining unavoidable database-to-provider race is minimized by
last-moment reauthorization; an external SMS API cannot share a DB transaction.

## Worker supervision/release

Entry point: `workers/fixer/general_worker.py` (standalone; no estimate worker
imports). Environment: HTTPS origin `BUILDOS_URL`, `FIXER_PRIVACY_WORKER_KEY`,
private `FIXER_PRIVACY_STATE_DIR`, `HERMES_SOURCE` pointing to installed Hermes;
use the configured supported model/subscription runtime. Run from a dedicated
private worker home/state under the actual service UID; no shared business context
or skills. The process suppresses plugin discovery around imports, setup and inference using
Hermes suppress_plugin_discovery (not an assumed environment-only switch), and disables memory/context/SOUL,
background review, trajectories and session persistence. Each job uses a fresh
spawned child and empty history. Model credentials stay outside tools/prompts.

Hermes can defer custom tools into tool_search/describe/call bridges. This worker
resolves the RAW request-only registry, compares actual schemas to its seven-tool
allowlist (only empty `required` normalization), installs that exact tool list AND
valid_tool_names, and fails closed on any unexpected schema. Dynamic tool bridges
are never exposed. This was exercised with actual Hermes inference and an actual
model-to-list_jobs call returning only a synthetic in-memory fixture.

State folder is 0700; journal is atomically replaced/fsynced 0600. A restarted
process retries a saved final result, never reexecutes an ambiguous saved run.
Expired results move to private `unacknowledged-<id>.json` recovery records.
`--once` supports a supervised one-shot poll/check; normal mode polls every 5s.
Manage retention of private recovery files separately from business audit retention.

Parent release must seed/verify the configured approver (August UUID
0160288f-29a2-4135-9dbc-e28d23779d2b), configure distinct secrets and the exact
Twilio original webhook URL, supervise worker and independent notice/delivery
polling, deploy UI resumption, apply/read-back migration ACLs/schema, then verify
synthetic live end-to-end queue/lease/revocation and owner-approved handset flow.
No employee SMS test is authorized by these fixture tests. A local build or an
accepted Twilio SID is not a completed live employee-answer verification.

## Tests

Run `scripts/test-fixer-employee-e2e.ts` (actual bundled app routes + real
isolated SQL, synthetic provider outcomes), the new `scripts/test-fixer-private-worker-db.ts` (real isolated PGlite),
`test-fixer-private-worker-routes.ts`, `test-fixer-private-delivery.ts`, existing
privacy chat/status/signed-SMS/dispatch/background regressions, `test:fixer`,
`test:fixer:routes`, Python `unittest discover -s workers/fixer`, task-file lint,
full lint/build and diff checks. The foundation DB test rehearses the old migration
alone; the employee DB test exercises the actual two-migration upgrade and new flow.
Strict RED -> GREEN was observed for each new behavior slice before production code.
