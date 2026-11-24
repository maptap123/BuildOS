-- Fixer may PROPOSE changes to QuickBooks; nothing is sent until a listed approver approves.
-- qb_approvers is the only list that matters: it is checked in the claim function itself.

create table if not exists public.qb_approvers (
  user_id uuid primary key references public.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create table if not exists public.qb_change_requests (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('customer','invoice','estimate')),
  action text not null check (action in ('create','update','delete','void','send','deactivate')),
  qb_entity_id text,
  sync_token text,                       -- SyncToken seen when proposed; execution refuses if QuickBooks moved on
  payload jsonb not null default '{}'::jsonb,   -- validated, whitelisted fields only
  before jsonb,                          -- snapshot of the record at proposal time (updates/deletes/voids)
  summary text not null,                 -- generated server-side, shown on the approval card
  reason text,                           -- Fixer's stated reason (untrusted text)
  job_id uuid references public.jobs(id) on delete set null,
  requested_by uuid references public.users(id),
  requested_note text,                   -- who Fixer says asked (untrusted text)
  status text not null default 'pending'
    check (status in ('pending','approving','executed','failed','rejected','expired')),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  decision_note text,
  result jsonb,
  error text,
  result_qb_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists qb_change_requests_status_idx on public.qb_change_requests(status, created_at desc);

alter table public.qb_approvers enable row level security;
alter table public.qb_change_requests enable row level security;
revoke all on public.qb_approvers from anon, authenticated;
revoke all on public.qb_change_requests from anon, authenticated;
grant all on public.qb_approvers to service_role;
grant all on public.qb_change_requests to service_role;

-- Atomic claim: exactly one caller can move a pending, unexpired request to 'approving'.
-- The approver check lives here so no code path can skip it.
create or replace function public.claim_qb_change(p_id uuid, p_actor uuid)
returns public.qb_change_requests
language plpgsql security definer set search_path = public as $$
declare r public.qb_change_requests;
begin
  if not exists (select 1 from qb_approvers a join users u on u.id = a.user_id
                 where a.user_id = p_actor and u.is_active) then
    raise exception 'Not a QuickBooks approver';
  end if;
  update qb_change_requests
     set status = 'approving', decided_by = p_actor, decided_at = now()
   where id = p_id and status = 'pending' and expires_at > now()
   returning * into r;
  if r.id is null then
    raise exception 'Request is not pending (already decided, or expired)';
  end if;
  return r;
end $$;
revoke all on function public.claim_qb_change(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_qb_change(uuid, uuid) to service_role;

-- Bell notification type for "needs approval".
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'proposal_accepted','proposal_declined','co_signed','co_rejected','lead_created',
    'task_assigned','task_blocked','log_missing','schedule_confirmed','schedule_declined',
    'schedule_question','qb_change_pending'
  ]));

-- Approvers: August, Lisa, Jason, Evelyn.
insert into public.qb_approvers (user_id)
select id from public.users
where lower(email) in ('august@jdcremodeling.com','lisa@jdcremodeling.com','jason@jdcremodeling.com','customerservice@jdcremodeling.com')
on conflict do nothing;
