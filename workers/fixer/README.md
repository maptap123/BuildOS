# Durable Fixer requests

This is a server worker for the existing Hermes engine, not another assistant or
model provider. It reads Hermes's configured model and provider credentials. It
must run on an always-on server under a supervisor, never on the estimator's PC.

## Live rollout verified — September 9, 2026

- Production: https://build-os-eight.vercel.app
- Enabled deployment: `dpl_7QqdBWFdpkRj3Tv244iZrWzSgiw7`
- Supabase project: `hdebklbhscvmdnatngkp`; migration version `20260909172926`.
  The local migration filename matches the version recorded by the deployment tool.
- Worker: Docker container `buildos-fixer-worker`, restart policy `unless-stopped`,
  UID/GID `10000:10000`, all Linux capabilities dropped, no-new-privileges enabled.
- Existing gateway `hermes-agent-dfbs-hermes-agent-1` and the Cloudflare Tunnel were
  not restarted or reconfigured. The sidecar uses the same immutable image
  `sha256:837f64b392abd400d0d740325ca5b5eb0891d9e12031432c201bbe95be395ba1`.
- Actual interpreter: `/opt/data/home/.local/share/uv/tools/hermes-agent/bin/python`.
  `/opt/hermes/.venv/bin/python` is **not** the active gateway runtime and lacks a
  dependency; do not use the old interpreter path for this installation.
- Hermes source `/opt/hermes`; home `/opt/data` is the existing bind mount from
  `/docker/hermes-agent-dfbs/data`. The live provider remains `openai-codex` with
  the configured `gpt-5.5` model. Runtime initialization and exact tool isolation
  passed in the sidecar before enabling requests.
- Host worker script: `/opt/buildos-fixer/worker.py` (mounted read-only).
  Host environment file: `/opt/buildos-fixer/worker.env` (mode 0600).
  Private persistent journal: `/var/lib/buildos-fixer` (mode 0700).
- `FIXER_WORKER_KEY` and `FIXER_BACKGROUND_ENABLED=true` are set in Vercel production.
  The key is server-only and is not recorded in this repository.

The live browser test created an isolated disposable account/lead/estimate without
sending email. It submitted a pricing request from the production Estimate Builder,
fully closed the browser, and confirmed real Hermes completion in the database.
A fresh browser login recovered the question, answer and exactly one sourced
proposal with labor/material breakdown. Zero estimate lines existed before human
approval; approving then repeating approval left exactly one line. All disposable
account, lead, estimate, request and proposal records were removed afterward. The
worker heartbeat was fresh and no requests were active at the final check.

Deployment used a clean snapshot of tracked project files plus the explicit feature
files, excluding unrelated local artifacts and secrets. The rollout source, tests,
migration and runbook are synchronized through the required GitHub plugin so normal
repository deployments preserve this feature.

## Deployment / rebuild procedure

1. Apply `supabase/migrations/20260909172926_fixer_background_requests.sql` after
   migrations 001–045. It creates service-only queue/lease RPCs and atomic proposal
   approval. Do not expose the queue or RPCs to authenticated/anonymous clients.
2. Deploy the BuildOS code with a new random `FIXER_WORKER_KEY` of at least 32
   characters. Leave `FIXER_BACKGROUND_ENABLED` unset until the worker is verified.
   Existing `HERMES_API_*` and the Cloudflare Tunnel stay unchanged.
3. Inspect the current VPS/container layout. The historical paths in
   `HERMES_PROGRESS.md` are **not verified live paths**. Install `worker.py` and
   configure the service example's interpreter, working directory, user and paths
   to match the actual Hermes installation. For a container installation, run this
   as a separate supervised service/container using the same Hermes source,
   Python dependencies and configured provider credential volume. Do not start an
   unsupervised background process inside a disposable web request.
4. Provide these server-only variables in a mode-0600 environment file:

   - `BUILDOS_URL`: the canonical HTTPS BuildOS origin.
   - `FIXER_WORKER_KEY`: the same dedicated worker secret as BuildOS.
   - `HERMES_SOURCE`: absolute path to the existing Hermes source checkout.
   - `HERMES_HOME`: the existing configured Hermes home/credential volume.
   - `FIXER_STATE_DIR`: private persistent disk directory, e.g. `/var/lib/buildos-fixer`.

   The worker does not need a Supabase service key, the general JDC agent key, or
   inbound public ports. It makes outbound short HTTPS calls; it does not remove
   or bypass the Cloudflare Tunnel's access controls. Ensure any existing Access
   policy on the BuildOS origin permits the worker through the approved service
   authentication configuration before starting it.
5. Verify the installed Hermes version supports `AIAgent`, its
   `enabled_toolsets/skip_memory/skip_context_files` options,
   `hermes_cli.runtime_provider.resolve_runtime_provider`, and registry tool
   registration. The live installation passed these checks on September 9, 2026; repeat
   them when upgrading the Hermes image or dependencies. The child verifies the exact
   tool allowlist at runtime and fails closed on incompatibility. Verify provider
   OAuth refresh under the service user; do not switch providers to work around it.
6. Start/enable the supervisor and confirm `fixer_worker_health.seen_at` advances.
   Enable `FIXER_BACKGROUND_ENABLED=true` in BuildOS and deploy that setting.
7. Smoke test on a disposable estimate: submit, fully close the browser, confirm
   worker completion in the DB, reopen from a new browser session, review answer
   and proposed labor/material/sub lines, and apply a selected line twice. Only
   one line should exist. Interrupt/restart the worker during another request:
   the request must fail clearly and its staged proposals must remain reviewable.

## Failure and isolation behavior

- Submission stores a user/estimate-scoped row and returns immediately. A unique
  active-request index prevents concurrent turns on the same estimate. The client
  retains the submission id for retries after a lost response. Reopening queries
  the server by signed-in user and estimate, without browser conversation storage.
- Only the supervised worker claims jobs. UI polling never drives execution.
  Claims use row locking; every request has a random lease credential. The worker
  runs Hermes locally in a fresh child process with only three estimating tools.
  Tools use the submitter's current permissions and a request-scoped credential;
  the model never receives secrets. No shell, general API helper, memory, or other
  user's session is exposed to that child.
- Proposals always pass through the existing server-side name provenance and
  cost breakdown resolver, then an atomic staging RPC. The request and lease bind
  the estimate; a temporary proposal session is never involved. Tool retries are
  deduplicated by canonical payload hash, even after a human applied the batch.
- Worker heartbeats renew a two-minute lease. Unclaimed work expires after 15
  minutes; the total request deadline is 30 minutes. Expiration records a clear
  failure, never silently replays ambiguous writes. On worker restart, an
  unfinished journal is failed; a completed journal is delivered again idempotently.
  Results that cannot be acknowledged after expiry remain in private
  `unacknowledged-<request-id>.json` for operator recovery, not automatic replay.
- A human may retry a failed question as a new request after reviewing partial
  proposals. Automatic reruns of a whole model conversation are deliberately
  avoided because earlier tool writes may have succeeded.
- Proposal approval locks the estimate and proposals, inserts lines, and marks
  them applied in one transaction. Repeat approval returns the existing lines.

## Checks

`npm run test:fixer` runs the real migration against embedded PostgreSQL and tests
queue isolation, leases, duplicate submissions/tools/approval, failure and result
recovery. `npm run test:fixer:routes` executes the actual request, worker and agent
route handlers with mocked auth/database clients to test authorization, ownership,
worker readiness and request credential restrictions.
`python -m unittest discover -s workers/fixer -p "test_*.py"` tests worker
disk recovery and request-bound tool behavior with a stub Hermes engine. Production
smoke tests and live Hermes compatibility remain necessary before enabling.

For the browser test, start a fresh `npm run test:fixer:fixture` in one terminal,
then run `npm run test:fixer:browser` in another. The loopback fixture serves the
actual panel and hook and uses the real migration/RPCs in embedded PostgreSQL.
Authentication and inference are test doubles; its independent test worker
finishes after the browser has fully closed. The test opens a new browser with no
previous storage, checks saved answers and staged lines, approves them, and checks
estimate isolation and persisted failure recovery. Stop/restart the fixture before
rerunning, because it deliberately retains state across browser sessions.

Both local and live Hermes runtime checks passed. The live Vercel connector needed
reauthentication, but the existing authenticated CLI, saved known-host SSH key,
and connected Supabase project supplied the authorized deployment access.

Retain the queue as conversation history according to the company's data retention
policy. Keep the worker journal private and on persistent disk; it contains estimate
data and a short-lived lease. Never commit environment files or journals.
