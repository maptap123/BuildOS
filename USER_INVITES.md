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
  ├─ accept URL built here, against NEXT_PUBLIC_APP_URL
  │    └─ https://<app>/auth/confirm?token_hash=…&type=invite&next=/welcome
  │
  ├─ RESEND_API_KEY set? → branded email from JDC's domain
  │                  else → the link comes back in the modal to copy and send
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

### Why not `inviteUserByEmail` as a fallback

Deliberately gone, not just bypassed. That call re-reads the project's Site URL and
**silently ignores a `redirectTo` that isn't in the allow-list** — which is exactly how
the original bug shipped, and it fails invisibly: the invite sends, looks fine, and
points at localhost.

`generateLink` reads neither setting. Nothing in the invite path depends on the
Supabase dashboard any more, so an invite cannot point at localhost again no matter
what those fields say.

### Without `RESEND_API_KEY`

The account and the link are still created — the modal shows the link with a **Copy**
button, and the office sends it however they normally reach that person. Same link,
same 24-hour single-use token; only the delivery is manual. That makes invites work
with no external setup at all, which is the fastest way to get someone in today.

## Configuration

### 1. Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Vercel | Already used for SMS links. Every invite link is built from it — if it is unset and Vercel injects nothing, the route now returns a clear error instead of mailing a dead link. |
| `RESEND_API_KEY` | Vercel | Turns on automatic sending. Unset = copy the link by hand, as above. |
| `EMAIL_FROM` | Vercel | Defaults to `BuildOS — JDC Construction <noreply@jdcremodeling.com>`. Must be a domain verified in Resend. |
| `EMAIL_REPLY_TO` | Vercel | Optional. Point replies at a real inbox, e.g. `office@jdcremodeling.com`. |

### 2. Supabase dashboard — Authentication → URL Configuration (optional)

Both fields still say `http://localhost:3000`. **Nothing in the invite flow reads them
any more**, so this is hygiene rather than a fix — worth doing before anyone adds a
"forgot password" link to the sign-in page, since that flow *would* read them.

- **Site URL** → `https://app.jdcplatform.com` (whatever `NEXT_PUBLIC_APP_URL` is)
- **Redirect URLs** → add `https://app.jdcplatform.com/**`

### 3. Resend (optional — only for automatic sending)

1. Create an account and add `jdcremodeling.com` under **Domains**.
2. Add the DKIM/SPF/return-path DNS records it gives you and wait for **Verified**.
3. Create an API key, set it as `RESEND_API_KEY` in Vercel, and redeploy.

Until the domain verifies, leave `RESEND_API_KEY` unset — a half-configured key sends
nothing, whereas the copy-link path always works.

## Re-inviting someone

Invite the same address again. The first attempt already created the account, so
`generateLink({ type: 'invite' })` fails with "already registered" — the route catches
that and issues a **recovery** link instead, which lands on the same set-a-password
screen. Permissions already granted to that account are kept.

This is the path for Lisa: `lisa@jdcremodeling.com` exists with permissions attached
and just needs a working link.

## If delivery fails

A send failure is treated the same as having no provider: the account and link survive,
and the modal shows the link plus the reason the email didn't go. A new account is
never left unreachable.

## Removing someone

Admin → Users → pick them → **Remove**. They lose access immediately and drop out
of the list; **Show removed** brings them back with a **Restore** button.

It is not a delete, on purpose. Crew members are referenced across daily logs, time
entries, task assignments and change orders, so deleting the row would blank out who
did what on jobs that have already been billed. A removed user keeps their name on
past work and simply loses access.

Two things change together, and both are needed. `is_active` is what the assignee
pickers and notification queries filter on — but **nothing reads it at sign-in**, so on
its own it would hide someone from the app while leaving them able to log straight
back in. The account is also banned at the auth level, which is what actually shuts
the door. Restoring reverses both.

You cannot remove yourself, and you cannot remove the last admin — either would leave
nobody able to undo it.

**Re-inviting someone who was removed puts them back.** It has to: the ban is checked
when a token is *verified*, not when it is generated, so without this the invite sends
cleanly and then dies on their phone as "user is banned" — and re-sending produces
another link that fails the same way. Inviting someone is the act of granting access,
so the invite lifts the removal and says so in the confirmation.
