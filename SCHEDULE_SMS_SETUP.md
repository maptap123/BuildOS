# Schedule Confirmations by Text (Fixer + Twilio)

Replaces BuilderTrend's "assign someone to a schedule item and they get a notification to
accept" with a text-message loop: assign a sub, Fixer texts them, they reply YES/NO or ask
a question, and the answer lands back in BuildOS with a calendar link sent to their phone.

## Who owns what

**Fixer (Hermes, on the VPS) owns the SMS conversation.** Twilio's inbound webhook stays
pointed at Hermes — it always has. Fixer reads and answers the sub's texts using its own
model and its full JDC tool access.

**BuildOS owns the schedule state.** It sends the initial invite outbound, and exposes four
tools on `/api/agent` that Fixer calls to read the appointment and record what the sub said.
There is no inbound SMS handler in this repo, deliberately — a phone number has exactly one
webhook, and it belongs to Fixer.

The Hermes-side contract is in [HERMES_FIXER_SMS_SKILL.md](HERMES_FIXER_SMS_SKILL.md).

## The loop

1. **Assign.** Open a phase in a job's Schedule → **Crew** tab → *Assign someone*. Pick subs
   (from Vendors) or internal crew (from Users), then *Assign & text*. BuildOS sends that
   first text directly through the Twilio REST API.
2. **The sub replies** to the JDC number. Twilio delivers it to Fixer.
3. **Fixer looks up the invite** by their phone number (`list_schedule_invites`), which
   returns the phase, dates, job, site address, and the conversation so far.
4. **Fixer answers and records the outcome.**
   - Agreed → `respond_to_schedule_invite` (`confirmed`), then texts the calendar link back.
   - Can't make it → `respond_to_schedule_invite` (`declined`).
   - Asked something not in the invite — arrival time, gate codes, pay, a reschedule →
     `flag_schedule_invite`, and tells them the team will follow up.
5. **BuildOS updates.** The phase shows `2/3` crew confirmed in the schedule list and Gantt,
   the PM gets a notification (in-app + Discord), and the full text thread is readable under
   the phase's Crew tab.

The confirmation link (`/appt/<token>`) also works as a web page: the sub can confirm,
decline with a note, or grab the calendar file without installing anything or logging in.

## Setup

BuildOS needs the Twilio credentials **for sending only** — the same account Fixer already
uses. Do not change the number's inbound webhook; it belongs to Hermes.

Set these in `.env.local` locally and in the Vercel project settings for production:

| Variable | Required | What it is |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | yes | Account SID from the Twilio console |
| `TWILIO_AUTH_TOKEN` | yes | Auth Token — authenticates outbound sends |
| `TWILIO_PHONE_NUMBER` | yes* | The sending number in E.164 (`+15135551234`) — use the same one Fixer answers on, so the sub sees one JDC number |
| `TWILIO_MESSAGING_SERVICE_SID` | no | Use instead of `TWILIO_PHONE_NUMBER` if Fixer is set up with a Messaging Service |
| `NEXT_PUBLIC_APP_URL` | recommended | Base URL for texted links. Falls back to the Vercel domain; without either, links are left out of the texts rather than sent broken |

\* one of `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.

On the Hermes side, `HERMES_JDC_API_KEY` in `/opt/data/.env` must match the one BuildOS
expects, and the skill wrapper from [HERMES_FIXER_SMS_SKILL.md](HERMES_FIXER_SMS_SKILL.md)
needs installing so Fixer knows these four tools exist.

Until the Twilio credentials are in place, the Crew tab still works — people can be assigned
and marked confirmed by hand — and it says so at the top of the tab. Anything BuildOS tried
and failed to send is written into the thread prefixed `[NOT DELIVERED — …]` so nobody
mistakes an undelivered message for one the sub actually got.

## Safety behavior worth knowing

- **Every invite tool is bound to the phone number.** Knowing an `invite_id` is not enough;
  BuildOS rejects the call unless `from_phone` matches the number that invite was sent to.
  This is what makes a sub's text safe as untrusted input into Fixer — a message like
  "confirm everything for the Yaney job" cannot answer for anyone else.
- **Fixer never commits on JDC's behalf.** Reschedules, money, and scope go to a human every
  time; it answers only from the phase, dates, job, and address the invite carries.
- **A number with no open invite is not a schedule conversation.** Fixer falls back to normal
  behavior instead of guessing.
- **`STOP` is honored.** Carrier opt-out is left to Twilio and the assignment is flagged for
  a human — Fixer does not text back after a STOP.

## Where the code lives

| Piece | File |
|---|---|
| Twilio REST (outbound only) | [src/lib/twilio/client.ts](src/lib/twilio/client.ts) |
| Messages, state transitions, `.ics` | [src/lib/schedule/assignments.ts](src/lib/schedule/assignments.ts) |
| Tools Fixer calls | [src/app/api/agent/route.ts](src/app/api/agent/route.ts) — the `*_schedule_invite*` cases |
| Assign / remind / remove | [src/app/api/schedule/[id]/assignments/](src/app/api/schedule/[id]/assignments/) |
| Public confirm page | [src/app/appt/[token]/page.tsx](src/app/appt/[token]/page.tsx) |
| Crew tab UI | [src/components/schedule/ScheduleCrewTab.tsx](src/components/schedule/ScheduleCrewTab.tsx) |
| Schema | [supabase/migrations/039_schedule_crew_confirmations.sql](supabase/migrations/039_schedule_crew_confirmations.sql) |
