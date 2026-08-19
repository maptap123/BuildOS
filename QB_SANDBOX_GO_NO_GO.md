# QuickBooks Sandbox Verification — Go/No-Go

**Status: NO-GO for any QB connect, but this does not block the Sept 1 launch** — per
LAUNCH_PLAN.md's own scope call, QuickBooks does not block launch and production connect is
allowed to trail. Lisa keeps manual QB entry as today.

## What this correction is about

LAUNCH_PLAN.md's code audit (2026-08-18) states: *"QuickBooks integration is real code, not a
stub — OAuth connect/callback/status + sync of job→customer, estimate, actual→bill... Needs
verification, not building."* That's half right. On inspection (2026-08-19):

- **`src/lib/quickbooks/client.ts` (437 lines) is real, substantive code** — token refresh,
  `syncJobAsCustomer`, `syncEstimateToQB`, `syncActualAsBill` are all properly implemented against
  the QBO v3 API, with retry-on-429 and SyncToken handling for updates. This part of the audit
  claim is accurate.
- **`GET /api/integrations/quickbooks/connect` and `GET /api/integrations/quickbooks/callback`
  are literal `501` stubs.** Neither imports `QuickBooksClient`. There is no `getAuthUrl()` or
  `handleCallback()` anywhere in the codebase. The callback route's only behavior is
  `console.log('[QB callback stub] ...')` and returning a "not yet implemented" JSON error.

The practical effect: **there is no way to get a token into `quickbooks_tokens` today.**
`client.ts`'s `loadTokens()` throws `"QuickBooks is not connected. No tokens found."` on every
call, which is what every sync function does immediately. The sync logic is real but currently
unreachable — this is closer to "half-built" than "needs verification."

## Why I didn't build the missing half right now

1. **No sandbox credentials exist to test against.** `QB_CLIENT_ID` and `QB_CLIENT_SECRET` are
   empty in `.env.local` — nobody has registered an Intuit Developer app yet. Writing an OAuth
   authorization-code flow and token-exchange handler without being able to run it against the
   real Intuit sandbox means shipping untested code in a security-sensitive path (it's literally
   handling OAuth credentials to the company's accounting system).
2. **Scope creep past "verify."** The connect/callback docstrings also call for encrypting tokens
   at rest (`QB_TOKEN_ENCRYPTION_KEY`, also unset) and CSRF `state` validation. Doing that properly
   means also touching `client.ts`'s `loadTokens()`/`refreshTokenIfNeeded()` (which currently read
   `access_token`/`refresh_token` as plain values) to decrypt — a change to code that already works
   correctly for the sync path, worth doing carefully with real credentials in hand, not blind.
3. **It isn't required for launch.** The plan itself says so.

`quickbooks_tokens` does have proper RLS (4 policies, one per command) — verified via the Supabase
advisor, no gap there.

## What's needed before this can actually be verified (not by me, in this environment)

1. Register a QuickBooks Developer app at developer.intuit.com, get a **sandbox** Client ID/Secret.
2. Set `QB_CLIENT_ID`, `QB_CLIENT_SECRET` (currently empty), and generate a
   `QB_TOKEN_ENCRYPTION_KEY` in `.env.local` and Vercel.
3. Implement `getAuthUrl()`/`handleCallback()` in `client.ts` and wire `connect`/`callback` routes
   to it (a bounded, well-documented task — Intuit's OAuth2 flow is standard).
4. Then the original Day 10 plan applies as written: connect → `syncJobAsCustomer` →
   `syncEstimateToQB` → `syncActualAsBill` against the sandbox, fix whatever breaks.

## Go/No-Go

| Check | Status |
|---|---|
| OAuth connect implemented | ❌ Stub (501) |
| OAuth callback implemented | ❌ Stub (501) |
| Sync logic (customer/estimate/bill) implemented | ✅ Real, untested end-to-end |
| Sandbox credentials available | ❌ Not registered |
| Token storage RLS | ✅ Correct |
| **Blocks Sept 1 launch** | **No — plan already scopes QB out; Lisa continues manual entry** |
