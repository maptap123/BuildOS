# QuickBooks Sandbox Verification — Go/No-Go

**Status: connect/callback are now implemented and configured with real sandbox credentials —
the OAuth handshake itself hasn't been run through a real browser login yet.** Still not a launch
blocker either way per LAUNCH_PLAN.md's own scope call; Lisa keeps manual QB entry until this is
confirmed working.

## History

LAUNCH_PLAN.md's original code audit (2026-08-18) claimed connect/callback were "real code...
needs verification, not building." On inspection (2026-08-19) they were actually literal `501`
stubs — no `getAuthUrl()`/`handleCallback()` existed anywhere, and no `QB_CLIENT_ID`/`SECRET` were
configured. Sync logic (`syncJobAsCustomer`, `syncEstimateToQB`, `syncActualAsBill` in
`src/lib/quickbooks/client.ts`) was and is real, just unreachable without a token.

Later the same day, the user provided real sandbox Client ID/Secret from an Intuit Developer app
they'd already registered (the same app Claude's own QuickBooks connector uses — a separate,
already-authorized connection scoped to the chat session, not something the deployed app can
reuse). With those in hand:

- `.env.local` now has real `QB_CLIENT_ID`/`QB_CLIENT_SECRET` (gitignored, not committed).
  `QB_ENVIRONMENT=sandbox`, `QB_REDIRECT_URI=http://localhost:3000/api/integrations/quickbooks/callback`.
- `getAuthUrl(state)` and `exchangeCodeForTokens(code)` added to `client.ts`, verified against
  Intuit's OAuth2 docs (authorize at `appcenter.intuit.com/connect/oauth2`, token exchange at
  `oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, scope `com.intuit.quickbooks.accounting`).
- `connect/route.ts`: admin-only, generates a CSRF `state` in an httpOnly cookie, redirects to
  Intuit's real authorization page.
- `callback/route.ts`: validates `state`, exchanges the code, stores the token in
  `quickbooks_tokens`, marks `integration_settings` connected, redirects to `/admin` with a
  success/error banner.
- `/admin` now has a QuickBooks card (didn't exist before) showing connection status with a
  Connect/Reconnect button.
- Tokens are stored **unencrypted** — matches how `client.ts`'s existing sync functions already
  read them (no decrypt step), and `quickbooks_tokens` has proper per-command RLS restricting it
  to service-role access only. Encryption-at-rest is a reasonable follow-up, not required to work.

## What's still unverified

The actual browser OAuth handshake — clicking Connect, logging into the real Intuit sandbox
company, granting access, landing back on `/admin` with a token stored — has not been run. This
needs a real, interactive browser session (Intuit's login page, MFA if enabled) that this
environment can't drive on its own. **Next step for a human:** log into BuildOS as an admin
(august@jdcremodeling.com), go to `/admin`, click Connect, and confirm it lands back with
"QuickBooks connected successfully." From there, `syncJobAsCustomer` → `syncEstimateToQB` →
`syncActualAsBill` can be tested against a job.

**Important distinction confirmed with the user:** the QuickBooks company "JDC Remodeling, LLC"
that Claude's own connector reaches is the **real production company**, not a sandbox — Claude was
explicitly told not to create/modify anything there. The sandbox Client ID/Secret now in
`.env.local` point at a **separate sandbox environment** (`QB_ENVIRONMENT=sandbox`) under the same
Intuit app registration — connecting BuildOS through them should not touch real company data. This
should be double-checked at the first real connect attempt (the company name shown after granting
access should read like a sandbox company, not "JDC Remodeling, LLC").

## Go/No-Go

| Check | Status |
|---|---|
| OAuth connect implemented | ✅ Real (was stub) |
| OAuth callback implemented | ✅ Real (was stub) |
| Sync logic (customer/estimate/bill) implemented | ✅ Real, still untested end-to-end |
| Sandbox credentials available | ✅ Provided by user, in `.env.local` |
| Full OAuth handshake run through a real login | ❌ Needs a human, interactive |
| Token storage RLS | ✅ Correct |
| **Blocks Sept 1 launch** | **No — plan already scopes QB out; Lisa continues manual entry until confirmed** |

## Update 2026-08-20 — production env fixed, connect verified to the Intuit boundary

The four QB env vars are now set on Vercel **production** (they previously existed there only as
May-era entries with no `QB_REDIRECT_URI` at all, so the connect route would have 501'd in prod):

- `QB_CLIENT_ID` / `QB_CLIENT_SECRET` — the real sandbox app credentials (same as `.env.local`)
- `QB_ENVIRONMENT=sandbox`
- `QB_REDIRECT_URI=https://build-os-eight.vercel.app/api/integrations/quickbooks/callback`

Production was redeployed and verified live: logged in as august@jdcremodeling.com and hit
`/api/integrations/quickbooks/connect` — it now issues the CSRF state cookie and redirects to
Intuit's authorization page with the correct `client_id` and the production `redirect_uri`.

**Remaining human steps (unchanged in kind, now smaller):**
1. In the Intuit Developer portal → your app → Keys & credentials (Development), make sure
   `https://build-os-eight.vercel.app/api/integrations/quickbooks/callback` is listed as a
   Redirect URI. Intuit rejects the handshake after login if it isn't registered.
2. From `/admin`, click Connect and log into the **sandbox** company. Confirm the success banner
   and that the company name shown is a sandbox company, not "JDC Remodeling, LLC".
