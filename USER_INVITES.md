# Inviting people to BuildOS

How an invite gets from Admin → Users → **Invite user** into someone's inbox, what
was broken, and the two things that have to be configured outside this repo.

## What was broken (2026-09-01)

Lisa's invite went out as a generic **"Supabase Auth — You've been invited"** email,
and the **Accept invitation** button pointed at `http://localhost:3000`, which on her
phone means `ERR_CONNECTION_REFUSED`.

Two separate causes:

1. `/api/admin/users/invite` called `inviteUserByEmail()` with no `redirectTo`, so
   Supabase fell back to the project's **Site URL** — still `http://localhost:3000`
   from local development. Every invitee got a link to their own phone.
2. Nothing in the app rendered the invite. Even pointed at the right host there was
   no route to verify the token, and no page to set a password on.

The token itself worked exactly once. Auth shows Lisa's link consumed 24 seconds
after it was sent; the second tap returned `#error=access_denied&error_code=otp_expired`,
which is the error hash in the screenshot.

## How it works now

```
Admin → Users → Invite user
  │
  ├─ generateLink({ type: 'invite' })      ← Supabase mints a token, sends nothing
  │    └─ already registered? retry as 'recovery' so re-invites work
  │
  ├─ BuildOS sends its own branded email (Resend)
  │    └─ https://<app>/auth/confirm?token_hash=…&type=invite&next=/welcome
  │
  ├─ GET /auth/confirm  → verifyOtp() server-side, sets the session cookie
  │
  └─ /welcome           → "Set your password" → /jobs
```

Verifying server-side with `token_hash` is what keeps the token out of the URL
fragment. Supabase's default link returns the session as `#access_token=…`, which the
server can never read — `/welcome` still handles that shape for the fallback path
below, but the normal path never produces it.

`/auth/*` and `/welcome` are public in `src/lib/supabase/middleware.ts`. They have to
be: the invitee has no session yet, and a bounce to `/login` would also drop the URL
fragment, since fragments are never sent to the server.

### Without `RESEND_API_KEY`

The route falls back to `inviteUserByEmail()` — Supabase's mailer, so the message
still arrives as "Supabase Auth" — **but with an explicit `redirectTo`**, which is the
part that was actually broken. For that fallback to work, the redirect URL must be
allow-listed (step 2 below); Supabase silently ignores a `redirectTo` that isn't, and
falls back to Site URL again.

## Configuration

### 1. Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Vercel | Already used for SMS links. Every invite link is built from it — if it is unset and Vercel injects nothing, the route now returns a clear error instead of mailing a dead link. |
| `RESEND_API_KEY` | Vercel | Turns on BuildOS-sent mail. Unset = Supabase fallback above. |
| `EMAIL_FROM` | Vercel | Defaults to `BuildOS — JDC Construction <noreply@jdcremodeling.com>`. Must be a domain verified in Resend. |
| `EMAIL_REPLY_TO` | Vercel | Optional. Point replies at a real inbox, e.g. `office@jdcremodeling.com`. |

### 2. Supabase dashboard — Authentication → URL Configuration

Both fields still say `http://localhost:3000`. Fix them regardless of which mail path
you use; the allow-list is what makes the fallback path work at all.

- **Site URL** → `https://app.jdcplatform.com` (whatever `NEXT_PUBLIC_APP_URL` is)
- **Redirect URLs** → add `https://app.jdcplatform.com/**`

### 3. Resend

1. Create an account and add `jdcremodeling.com` under **Domains**.
2. Add the DKIM/SPF/return-path DNS records it gives you and wait for **Verified**.
3. Create an API key, set it as `RESEND_API_KEY` in Vercel, and redeploy.

Until the domain verifies, leave `RESEND_API_KEY` unset — a half-configured key sends
nothing, whereas the Supabase fallback still delivers.

Worth doing on its own: Supabase's built-in mailer is capped at roughly two messages
an hour and is explicitly not meant for production, so onboarding a crew of five in
one sitting silently drops most of the invites.

## Re-inviting someone

Invite the same address again. The first attempt already created the account, so
`generateLink({ type: 'invite' })` fails with "already registered" — the route catches
that and issues a **recovery** link instead, which lands on the same set-a-password
screen. Permissions already granted to that account are kept.

This is the path for Lisa: `lisa@jdcremodeling.com` exists with permissions attached
and just needs a working link.

## If delivery fails

The account and the link both survive a send failure — the route returns the accept
URL and the admin screen shows it under **Send this link yourself**, so a new account
is never stranded unreachable. The link is single-use and good for 24 hours.
