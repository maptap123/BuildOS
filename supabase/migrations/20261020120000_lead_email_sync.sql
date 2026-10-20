-- Lead email sync: emails exchanged with a lead's client in the team's Outlook
-- mailboxes land on the lead timeline as 'email' activities.
--
-- email_message_id is the RFC 822 Message-ID (Graph internetMessageId). It is
-- the same in every mailbox that holds the message, so one email CC'd to two
-- teammates is logged once. NULL for hand-typed entries, which never conflict.

alter table public.lead_activities
  add column if not exists email_message_id text,
  add column if not exists email_direction  text check (email_direction in ('sent', 'received')),
  add column if not exists email_subject    text,
  add column if not exists email_from       text,
  add column if not exists email_to         text;

alter table public.lead_activities
  drop constraint if exists lead_activities_email_message_unique;
alter table public.lead_activities
  add constraint lead_activities_email_message_unique unique (lead_id, email_message_id);

-- Deleting a synced email from the timeline must stick: the next sync checks
-- here before re-adding it.
create table if not exists public.lead_email_dismissals (
  lead_id          uuid not null references public.leads(id) on delete cascade,
  email_message_id text not null,
  dismissed_by     uuid references public.users(id),
  dismissed_at     timestamptz not null default now(),
  primary key (lead_id, email_message_id)
);
alter table public.lead_email_dismissals enable row level security;

-- Throttles the on-open sync so flipping between leads doesn't hammer Graph.
alter table public.leads
  add column if not exists emails_synced_at timestamptz;
