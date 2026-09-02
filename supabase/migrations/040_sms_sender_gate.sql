-- 040_sms_sender_gate.sql
-- Who is allowed to text Fixer.
--
-- Replaces the fixed SMS_ALLOWED_USERS list in the Hermes .env with a record
-- BuildOS owns: unknown numbers are let in but held to a narrow surface until
-- August approves them, and an approval sticks so he is only asked once.

create table if not exists sms_senders (
  id                uuid primary key default gen_random_uuid(),
  phone             text not null unique,          -- E.164

  status            text not null default 'pending'
                      check (status in ('pending', 'allowed', 'blocked')),

  -- Best guess at who this is, for the approval prompt: a vendor/contact name
  -- if we can match one, otherwise whatever they told us.
  label             text,

  first_message     text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  message_count     integer not null default 1,

  -- Set when the number belongs to a BuildOS user, so Fixer can act as them.
  resolved_user_id  uuid references users(id) on delete set null,

  approved_by       uuid references users(id) on delete set null,
  approved_at       timestamptz,
  decided_note      text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sms_senders_status_idx on sms_senders (status, last_seen_at desc);

drop trigger if exists sms_senders_updated_at on sms_senders;
create trigger sms_senders_updated_at
  before update on sms_senders
  for each row execute function handle_updated_at();

alter table sms_senders enable row level security;

-- Reads only; every write goes through the service-role client in /api/agent
-- after the caller's authority has been checked.
drop policy if exists sms_senders_select on sms_senders;
create policy sms_senders_select on sms_senders
  for select using (auth.uid() is not null);
