-- 039_schedule_crew_confirmations.sql
-- Assign subs/crew to a schedule item, text them through Fixer (Twilio),
-- and track their confirm / decline reply plus the SMS conversation.

create table if not exists schedule_assignments (
  id                uuid primary key default gen_random_uuid(),
  schedule_item_id  uuid not null references schedule_items(id) on delete cascade,
  job_id            uuid not null references jobs(id) on delete cascade,

  -- who is assigned: a vendor/sub record, an internal user, or a job contact
  assignee_type     text not null check (assignee_type in ('vendor', 'user', 'contact')),
  vendor_id         uuid references vendors(id) on delete cascade,
  user_id           uuid references users(id) on delete cascade,
  contact_id        uuid references contacts(id) on delete cascade,

  -- snapshot taken when the invite is sent, so history survives a vendor edit
  contact_name      text not null,
  phone             text,

  status            text not null default 'pending'
                      check (status in ('pending', 'sent', 'confirmed', 'declined', 'cancelled')),

  -- public link token for the confirm page + .ics download
  token             text not null unique default encode(gen_random_bytes(16), 'hex'),

  invited_at        timestamptz,
  responded_at      timestamptz,
  response_note     text,
  reminder_count    integer not null default 0,
  last_outbound_at  timestamptz,
  last_inbound_at   timestamptz,

  -- set when Fixer could not answer an inbound question on its own
  needs_attention   boolean not null default false,

  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One assignment per person per schedule item. Partial indexes because NULLs
-- are distinct in a plain UNIQUE, which would let the same vendor be added twice.
create unique index if not exists schedule_assignments_item_vendor_uniq
  on schedule_assignments (schedule_item_id, vendor_id) where vendor_id is not null;
create unique index if not exists schedule_assignments_item_user_uniq
  on schedule_assignments (schedule_item_id, user_id) where user_id is not null;
create unique index if not exists schedule_assignments_item_contact_uniq
  on schedule_assignments (schedule_item_id, contact_id) where contact_id is not null;

create index if not exists schedule_assignments_item_idx  on schedule_assignments (schedule_item_id);
create index if not exists schedule_assignments_job_idx   on schedule_assignments (job_id);
-- inbound SMS is routed by the sender's number back to their open invite
create index if not exists schedule_assignments_phone_idx on schedule_assignments (phone, status);

create trigger schedule_assignments_updated_at
  before update on schedule_assignments
  for each row execute function handle_updated_at();

-- Full SMS transcript for each assignment: what Fixer sent, what the sub replied.
create table if not exists schedule_assignment_messages (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references schedule_assignments(id) on delete cascade,
  direction     text not null check (direction in ('inbound', 'outbound')),
  body          text not null,
  from_number   text,
  to_number     text,
  twilio_sid    text,
  intent        text,   -- classified intent of an inbound message
  ai_generated  boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists schedule_assignment_messages_assignment_idx
  on schedule_assignment_messages (assignment_id, created_at);

-- Twilio retries webhooks; the SID makes inbound handling idempotent.
create unique index if not exists schedule_assignment_messages_sid_uniq
  on schedule_assignment_messages (twilio_sid) where twilio_sid is not null;

alter table schedule_assignments         enable row level security;
alter table schedule_assignment_messages enable row level security;

-- Reads only. Every write goes through the service-role client in the API
-- routes, which bypasses RLS after checking module permissions.
create policy schedule_assignments_select on schedule_assignments
  for select using (auth.uid() is not null);

create policy schedule_assignment_messages_select on schedule_assignment_messages
  for select using (auth.uid() is not null);

-- New notification types for the confirm/decline/question loop.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (
  type = any (array[
    'proposal_accepted', 'proposal_declined',
    'co_signed', 'co_rejected',
    'lead_created',
    'task_assigned', 'task_blocked',
    'log_missing',
    'schedule_confirmed', 'schedule_declined', 'schedule_question'
  ])
);
