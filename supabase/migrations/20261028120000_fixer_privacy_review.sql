-- Preparation only: applying this migration requires separate release approval.
-- No private source retrieval or model execution is authorized by this queue.
begin;
create table public.fixer_privacy_settings (
 id boolean primary key default true check(id),
 approver_user_id uuid not null references public.users(id)
);
create table public.fixer_verified_phones (
 user_id uuid primary key references public.users(id),
 phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 verified_at timestamptz not null default now(),
 verified_by uuid not null references public.users(id)
);
-- A profile phone is not a verification. Populate this table only after a
-- separate trusted verification; users cannot attest to their own destination.
create table public.fixer_privacy_requests (
 id uuid primary key,
 user_id uuid not null references public.users(id),
 phone text not null,
 message text not null check(length(trim(message)) between 1 and 1000),
 status text not null default 'held' check(status in ('held','approved_waiting_for_secure_worker','denied','expired')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 minutes',
 decided_at timestamptz,
 decided_by uuid references public.users(id),
 decision_sid text unique
);
create index fixer_privacy_user_history on public.fixer_privacy_requests(user_id,created_at);
create table public.fixer_privacy_outbox (
 request_id uuid primary key references public.fixer_privacy_requests(id),
 state text not null default 'pending' check(state in ('pending','sending','sent','unknown','cancelled')),
 lease uuid,
 claimed_at timestamptz,
 provider_sid text,
 finished_at timestamptz
);
alter table public.fixer_privacy_settings enable row level security;
alter table public.fixer_verified_phones enable row level security;
alter table public.fixer_privacy_requests enable row level security;
alter table public.fixer_privacy_outbox enable row level security;
revoke all on public.fixer_privacy_settings,public.fixer_verified_phones,public.fixer_privacy_requests,public.fixer_privacy_outbox from public,anon,authenticated;
grant all on public.fixer_privacy_settings,public.fixer_verified_phones,public.fixer_privacy_requests,public.fixer_privacy_outbox to service_role;

create function public.enqueue_fixer_privacy_request(p_id uuid,p_user uuid,p_message text)
returns jsonb language plpgsql set search_path=public as $$
declare r fixer_privacy_requests; destination text;
begin
 if not exists(select 1 from users u join user_permissions p on p.user_id=u.id
   where u.id=p_user and u.is_active and p.module='ai' and p.can_view)
 then raise exception 'Requester unavailable'; end if;
 select phone into destination from fixer_verified_phones where user_id=p_user for share;
 if destination is null then raise exception 'Verified destination unavailable'; end if;
 if not exists(select 1 from fixer_privacy_settings s join users u on u.id=s.approver_user_id
   join user_permissions p on p.user_id=u.id
   where s.id and u.is_active and p.module='admin' and p.can_manage)
 then raise exception 'Approver unavailable'; end if;
 -- Serialize repeated submission of exactly this ID, including concurrent retries.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from fixer_privacy_requests where id=p_id;
 if found then
   if r.user_id<>p_user or r.message<>p_message or r.phone<>destination then raise exception 'Request id already used'; end if;
 else
   insert into fixer_privacy_requests(id,user_id,phone,message) values(p_id,p_user,destination,p_message) returning * into r;
   insert into fixer_privacy_outbox(request_id) values(r.id);
 end if;
 -- Never return the question, phone, audit fields or any future result in status.
 return jsonb_build_object('id',r.id,'status',r.status,'created_at',r.created_at,'expires_at',r.expires_at);
end $$;
revoke all on function public.enqueue_fixer_privacy_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_fixer_privacy_request(uuid,uuid,text) to service_role;

-- Called ONLY after the server has cryptographically verified the inbound SMS.
-- Authenticated users and general /api/agent credentials have no execution grant.
create function public.decide_fixer_privacy_request(p_id uuid,p_from text,p_approve boolean,p_sid text)
returns boolean language plpgsql set search_path=public as $$
declare r fixer_privacy_requests; owner_id uuid;
begin
 if p_from is distinct from '+15133480483' or p_sid is null or p_sid !~ '^SM[0-9A-Za-z]{1,64}$' or p_approve is null then return false; end if;
 select s.approver_user_id into owner_id from fixer_privacy_settings s
 join users u on u.id=s.approver_user_id
 join fixer_verified_phones f on f.user_id=u.id and f.phone=p_from
 join user_permissions p on p.user_id=u.id and p.module='admin' and p.can_manage
 where s.id and u.is_active;
 if owner_id is null then return false; end if;
 select * into r from fixer_privacy_requests where id=p_id for update;
 if not found then return false; end if;
 if r.expires_at<=now() then
   update fixer_privacy_requests set status='expired' where id=p_id and status='held';
   return false;
 end if;
 if r.status<>'held' then
   return r.decision_sid=p_sid and r.decided_by=owner_id and
     r.status=case when p_approve then 'approved_waiting_for_secure_worker' else 'denied' end;
 end if;
 if exists(select 1 from fixer_privacy_requests where decision_sid=p_sid) then return false; end if;
 -- Revoked requester access or replaced/revoked verification cancels disclosure.
 if not exists(select 1 from users u join user_permissions p on p.user_id=u.id
   join fixer_verified_phones f on f.user_id=u.id
   where u.id=r.user_id and u.is_active and p.module='ai' and p.can_view and f.phone=r.phone)
 then return false; end if;
 begin
   update fixer_privacy_requests set status=case when p_approve then 'approved_waiting_for_secure_worker' else 'denied' end,
     decided_at=now(),decided_by=owner_id,decision_sid=p_sid where id=p_id;
 exception when unique_violation then return false;
 end;
 return true;
end $$;
revoke all on function public.decide_fixer_privacy_request(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.decide_fixer_privacy_request(uuid,text,boolean,text) to service_role;


create function public.claim_fixer_privacy_notice() returns jsonb
language plpgsql set search_path=public as $$
declare n fixer_privacy_outbox; rec fixer_privacy_requests;
begin
 -- A crashed/ambiguous provider call is not retried automatically.
 update fixer_privacy_outbox set state='unknown',finished_at=now()
 where state='sending' and claimed_at<now()-interval '2 minutes';
 update fixer_privacy_requests set status='expired' where status='held' and expires_at<=now();
 update fixer_privacy_outbox o set state='cancelled',finished_at=now()
 where state='pending' and not exists(select 1 from fixer_privacy_requests r where r.id=o.request_id and r.status='held');
 if not exists(select 1 from fixer_privacy_settings s join users u on u.id=s.approver_user_id
   join fixer_verified_phones f on f.user_id=u.id and f.phone='+15133480483'
   join user_permissions p on p.user_id=u.id and p.module='admin' and p.can_manage
   where s.id and u.is_active) then return null; end if;
 select o.* into n from fixer_privacy_outbox o join fixer_privacy_requests r on r.id=o.request_id
 join users u on u.id=r.user_id and u.is_active
 join user_permissions p on p.user_id=u.id and p.module='ai' and p.can_view
 join fixer_verified_phones f on f.user_id=u.id and f.phone=r.phone
 where o.state='pending' and r.status='held' and r.expires_at>now()
 order by r.created_at for update of o skip locked limit 1;
 if not found then return null; end if;
 update fixer_privacy_outbox set state='sending',lease=gen_random_uuid(),claimed_at=now()
 where request_id=n.request_id returning * into n;
 select * into rec from fixer_privacy_requests where id=n.request_id;
 return jsonb_build_object('request_id',rec.id,'user_id',rec.user_id,'message',rec.message,'lease',n.lease);
end $$;
create function public.finish_fixer_privacy_notice(p_id uuid,p_lease uuid,p_sid text) returns boolean
language plpgsql set search_path=public as $$
begin
 update fixer_privacy_outbox set state=case when p_sid is null then 'unknown' else 'sent' end,
 provider_sid=p_sid,finished_at=now()
 where request_id=p_id and lease=p_lease and state='sending';
 return found;
end $$;
revoke all on function public.claim_fixer_privacy_notice(),public.finish_fixer_privacy_notice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_fixer_privacy_notice(),public.finish_fixer_privacy_notice(uuid,uuid,text) to service_role;
commit;
