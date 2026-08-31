# Schedule Confirmations by Text (Fixer + Twilio)

Replaces BuilderTrend's "assign someone to a schedule item and they get a notification to
accept" with a text-message loop: assign a sub, Fixer texts them, they reply YES/NO or ask
a question, and the answer lands back in BuildOS with a calendar link sent to their phone.

## The loop

1. **Assign.** Open a phase in a job's Schedule → **Crew** tab → *Assign someone*. Pick subs
   (from Vendors) or internal crew (from Users), then *Assign & text*.
2. **Fixer texts them** the phase, the dates, the job, the site address, and asks them to
   reply YES or NO.
3. **They reply.**
   - `YES` (or yep, ok, 👍, will do, …) → marked **Confirmed**, and Fixer texts back a link
     to add it to their calendar (Google Calendar one-tap, or `.ics` for Apple/Outlook).
   - `NO` (or can't, nope, …) → marked **Declined**; Fixer acknowledges and tells them the
     team will follow up.
   - **A question** → Claude answers from the appointment facts only. Anything it can't
     answer from those facts — arrival time, gate codes, pay, scope changes, reschedules —
     it says it will check with the team and flags the assignment **Needs you**.
4. **BuildOS updates.** The phase shows `2/3` crew confirmed in the schedule list and Gantt,
   the PM gets a notification (in-app + Discord), and the full text thread is readable under
   the phase's Crew tab.

The confirmation link (`/appt/<token>`) also works as a web page: the sub can confirm,
decline with a note, or grab the calendar file without installing anything or logging in.

## Twilio setup

1. Create a Twilio account and buy an **SMS-capable US number**
   (Console → Phone Numbers → Buy a number).
2. Copy the **Account SID** and **Auth Token** from the Console dashboard.
3. Point the number's inbound webhook at BuildOS:
   Phone Numbers → your number → *Messaging* → **A message comes in**
   → `HTTP POST` → `https://<your-domain>/api/twilio/sms`
4. Fill in the environment variables below (locally in `.env.local`, and in the Vercel
   project settings for production).

### Environment variables

| Variable | Required | What it is |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | yes | Account SID from the Twilio console |
| `TWILIO_AUTH_TOKEN` | yes | Auth Token — also verifies inbound webhook signatures |
| `TWILIO_PHONE_NUMBER` | yes* | The sending number in E.164 (`+15135551234`) |
| `TWILIO_MESSAGING_SERVICE_SID` | no | Use instead of `TWILIO_PHONE_NUMBER` if you set up a Messaging Service |
| `TWILIO_WEBHOOK_URL` | no | Set only if signature validation fails — must exactly match the URL configured in Twilio |
| `NEXT_PUBLIC_APP_URL` | yes | Base URL used in texted links. Falls back to the Vercel domain; without either, links are left out of the texts |
| `ANTHROPIC_API_KEY` | yes | Powers Fixer's answers to questions. Without it, questions are escalated to a human instead of answered |

\* one of `TWILIO_PHONE_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.

Until Twilio is configured, the Crew tab still works — people can be assigned and marked
confirmed by hand — and it says so at the top of the tab. Anything Fixer tried and failed to
send is written into the thread prefixed `[NOT DELIVERED — …]` so nobody mistakes an
undelivered message for one the sub actually got.

## Safety behavior worth knowing

- **Inbound webhooks are signature-verified.** An unsigned or wrongly signed POST gets a 403,
  so nobody can forge a confirmation.
- **Unknown numbers never get an auto-reply.** A text from a number with no open invite is
  posted to Discord for a human instead.
- **Twilio retries are idempotent.** Replays of the same `MessageSid` are dropped, so a retry
  can't double-confirm or send a second reply.
- **Fixer never commits on JDC's behalf.** Reschedules, money, and scope go to a human every
  time; it only answers from the phase, dates, job, and address it was given.
- **`STOP` is honored.** Carrier opt-out is left to Twilio and the assignment is flagged for
  a human — Fixer does not text back after a STOP.

## Where the code lives

| Piece | File |
|---|---|
| Twilio REST + signature validation | [src/lib/twilio/client.ts](src/lib/twilio/client.ts) |
| Messages, state transitions, `.ics` | [src/lib/schedule/assignments.ts](src/lib/schedule/assignments.ts) |
| Intent classification + reply | [src/lib/schedule/fixerSms.ts](src/lib/schedule/fixerSms.ts) |
| Inbound webhook | [src/app/api/twilio/sms/route.ts](src/app/api/twilio/sms/route.ts) |
| Assign / remind / remove | [src/app/api/schedule/[id]/assignments/](src/app/api/schedule/[id]/assignments/) |
| Public confirm page | [src/app/appt/[token]/page.tsx](src/app/appt/[token]/page.tsx) |
| Crew tab UI | [src/components/schedule/ScheduleCrewTab.tsx](src/components/schedule/ScheduleCrewTab.tsx) |
| Schema | [supabase/migrations/039_schedule_crew_confirmations.sql](supabase/migrations/039_schedule_crew_confirmations.sql) |
