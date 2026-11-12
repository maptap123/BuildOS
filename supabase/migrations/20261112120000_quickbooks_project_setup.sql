-- No backfill: existing QuickBooks mappings and business data remain unchanged.
alter table public.jobs add column if not exists qb_link_version integer not null default 0;
alter table public.jobs add column if not exists qb_parent_customer_id text;
alter table public.jobs add column if not exists qb_graphql_project_id text;

create table public.qb_project_creation_claims (
  realm_id text not null, parent_id text not null, normalized_name text not null,
  job_id uuid not null references public.jobs(id), actor_id uuid not null references public.users(id),
  created_at timestamptz not null default now(), primary key(realm_id,parent_id,normalized_name)
);
alter table public.qb_project_creation_claims enable row level security;
revoke all on public.qb_project_creation_claims from anon, authenticated;
grant all on public.qb_project_creation_claims to service_role;

create function public.check_qb_project_admin(p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from users u join user_permissions p on p.user_id=u.id
    where u.id=p_actor and u.is_active and p.module='admin' and p.can_manage) then
    raise exception 'Active office administrator required';
  end if;
end $$;

create function public.claim_job_quickbooks_creation(p_job_id uuid,p_version integer,p_parent_id text,p_name text,p_actor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v integer; realm text; affected integer;
begin
  perform check_qb_project_admin(p_actor);
  select qb_link_version into v from jobs where id=p_job_id for update;
  if v is null or v<>p_version then raise exception 'Connection changed'; end if;
  if p_parent_id !~ '^[0-9]+$' or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid project'; end if;
  select realm_id into realm from quickbooks_tokens order by updated_at desc limit 1;
  if realm is null then raise exception 'QuickBooks connection missing'; end if;
  insert into qb_project_creation_claims(realm_id,parent_id,normalized_name,job_id,actor_id)
    values(realm,p_parent_id,lower(trim(p_name)),p_job_id,p_actor) on conflict do nothing;
  get diagnostics affected = row_count;
  return affected=1;
end $$;

create function public.set_job_quickbooks_project(p_job_id uuid,p_version integer,p_parent_id text,p_project_id text,p_name text,p_actor uuid,p_graphql_id text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  perform check_qb_project_admin(p_actor);
  -- Serialize duplicate-cost-target checks across jobs as well as edits within a job.
  perform pg_advisory_xact_lock(hashtextextended('qb-project:'||p_project_id,0));
  select qb_link_version into v from jobs where id=p_job_id for update;
  if v is null or v<>p_version then raise exception 'Connection changed'; end if;
  if p_parent_id !~ '^[0-9]+$' or p_project_id !~ '^[0-9]+$' or p_parent_id=p_project_id or length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid project'; end if;
  if exists(select 1 from jobs where id<>p_job_id and qb_customer_id=p_project_id)
    or exists(select 1 from job_external_links where job_id<>p_job_id and provider='quickbooks' and status='linked' and external_id=p_project_id) then
    raise exception 'Project already connected to another job';
  end if;
  perform set_config('buildos.qb_manual_job',p_job_id::text,true);
  update job_external_links set status='rejected',matched_by='admin',updated_at=now()
    where job_id=p_job_id and provider='quickbooks' and external_id is distinct from p_project_id;
  insert into job_external_links(job_id,provider,external_id,external_parent_id,display_name,link_type,status,confidence,matched_by,match_reason,raw_metadata,last_verified_at)
    values(p_job_id,'quickbooks',p_project_id,p_parent_id,p_name,'job','linked',1,'admin','Explicit project selection',jsonb_build_object('IsProject',true,'graphql_project_id',p_graphql_id),now())
    on conflict(job_id,provider,external_id) do update set external_parent_id=excluded.external_parent_id,display_name=excluded.display_name,
      link_type='job',status='linked',confidence=1,matched_by='admin',match_reason=excluded.match_reason,
      raw_metadata=excluded.raw_metadata,last_verified_at=now(),updated_at=now();
  -- qb_customer_id is the accounting CustomerRef COST TARGET, not the homeowner.
  -- Preserve this contract for costSync/billingSync; store parent separately.
  update jobs set qb_customer_id=p_project_id,qb_project_id=p_project_id,qb_parent_customer_id=p_parent_id,
    qb_graphql_project_id=p_graphql_id,qb_link_version=v+1,qb_sync_status='synced',qb_last_synced_at=now(),qb_sync_error=null where id=p_job_id;
  return v+1;
end $$;

create function public.protect_explicit_qb_job() returns trigger language plpgsql set search_path = public as $$
begin
  if old.qb_link_version>0 and current_setting('buildos.qb_manual_job',true) is distinct from old.id::text and
    (new.qb_customer_id is distinct from old.qb_customer_id or new.qb_project_id is distinct from old.qb_project_id
      or new.qb_parent_customer_id is distinct from old.qb_parent_customer_id or new.qb_graphql_project_id is distinct from old.qb_graphql_project_id
      or new.qb_link_version is distinct from old.qb_link_version) then raise exception 'Cannot overwrite explicit QuickBooks selection'; end if;
  return new;
end $$;
create trigger protect_explicit_qb_job before update on jobs for each row execute function protect_explicit_qb_job();

create function public.protect_explicit_qb_link() returns trigger language plpgsql set search_path = public as $$
declare j uuid; provider_name text; v integer;
begin
  j:=case when TG_OP='DELETE' then old.job_id else new.job_id end;
  provider_name:=case when TG_OP='DELETE' then old.provider else new.provider end;
  if provider_name='quickbooks' then
    select qb_link_version into v from jobs where id=j for update;
    if v>0 and current_setting('buildos.qb_manual_job',true) is distinct from j::text then raise exception 'Cannot overwrite explicit QuickBooks selection'; end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_explicit_qb_link before insert or update or delete on job_external_links for each row execute function protect_explicit_qb_link();

revoke all on function public.check_qb_project_admin(uuid) from public,anon,authenticated;
revoke all on function public.claim_job_quickbooks_creation(uuid,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function public.set_job_quickbooks_project(uuid,integer,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_job_quickbooks_creation(uuid,integer,text,text,uuid) to service_role;
grant execute on function public.set_job_quickbooks_project(uuid,integer,text,text,text,uuid,text) to service_role;
