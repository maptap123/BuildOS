-- Durable queue. Only server routes may mutate it; worker leases fence late tools.
create table public.fixer_requests (
 id uuid primary key, user_id uuid not null references public.users(id) on delete cascade,
 estimate_id uuid not null references public.estimates(id) on delete cascade,
 message text not null check(length(message) between 1 and 30000),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 progress text not null default 'Queued for Fixer', result text, error text,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 lease_token uuid, lease_until timestamptz, deadline timestamptz not null default now()+interval '30 minutes'
);
create unique index fixer_one_active_per_estimate on public.fixer_requests(estimate_id) where status in ('queued','running');
create index fixer_history on public.fixer_requests(user_id,estimate_id,created_at);
create table public.fixer_worker_health(id text primary key, seen_at timestamptz not null);
alter table public.estimate_line_proposals add column fixer_request_id uuid references public.fixer_requests(id) on delete set null;
create table public.fixer_tool_batches (
 request_id uuid not null references public.fixer_requests(id) on delete cascade,
 payload_hash text not null, batch_id uuid not null, primary key(request_id,payload_hash)
);
alter table public.fixer_requests enable row level security;
alter table public.fixer_worker_health enable row level security;
alter table public.fixer_tool_batches enable row level security;
revoke all on public.fixer_requests, public.fixer_worker_health, public.fixer_tool_batches from anon, authenticated;
grant all on public.fixer_requests, public.fixer_worker_health, public.fixer_tool_batches to service_role;

create function public.expire_fixer_requests() returns void language sql set search_path = public as $$
 update fixer_requests set status='failed', finished_at=now(), progress='Needs attention',
 error=case when status='queued' then 'Fixer could not start this request. Please try again.'
 else 'Fixer stopped before saving a complete answer. Review any proposed lines before trying again.' end
 where status in ('queued','running') and (deadline < now() or (status='running' and lease_until < now())
 or (status='queued' and created_at < now()-interval '15 minutes'));
$$;

create function public.enqueue_fixer_request(p_id uuid,p_user uuid,p_estimate uuid,p_message text)
returns jsonb language plpgsql set search_path = public as $$
declare r fixer_requests;
begin
 perform expire_fixer_requests();
 perform 1 from estimates where id=p_estimate and not coalesce(is_locked,false) for update;
 if not found then raise exception 'Estimate unavailable'; end if;
 select * into r from fixer_requests where id=p_id;
 if found then
   if r.user_id<>p_user or r.estimate_id<>p_estimate or r.message<>p_message then raise exception 'Id already used'; end if;
 else
   insert into fixer_requests(id,user_id,estimate_id,message) values(p_id,p_user,p_estimate,p_message) returning * into r;
 end if;
 return to_jsonb(r)-'lease_token'-'lease_until';
end $$;

create function public.claim_fixer_request() returns jsonb language plpgsql set search_path = public as $$
declare r fixer_requests;
begin
 insert into fixer_worker_health values('hermes',now()) on conflict(id) do update set seen_at=excluded.seen_at;
 perform expire_fixer_requests();
 select * into r from fixer_requests where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update fixer_requests set status='running',started_at=now(),lease_token=gen_random_uuid(),
 lease_until=now()+interval '2 minutes',progress='Fixer is reviewing this estimate'
 where id=r.id returning * into r;
 return to_jsonb(r);
end $$;

create function public.update_fixer_request(p_id uuid,p_lease uuid,p_action text,p_text text)
returns boolean language plpgsql set search_path = public as $$
declare r fixer_requests;
begin
 select * into r from fixer_requests where id=p_id for update;
 if not found or r.lease_token is distinct from p_lease then return false; end if;
 -- A completion acknowledgment may be lost. Repeating it must be harmless.
 if r.status in ('completed','failed') then
   return (p_action='complete' and r.status='completed' and r.result=p_text)
     or (p_action='fail' and r.status='failed' and r.error=p_text);
 end if;
 if r.status<>'running' or r.lease_until<now() or r.deadline<now() then return false; end if;
 if p_action='heartbeat' then
   update fixer_requests set lease_until=least(deadline,now()+interval '2 minutes'),progress=left(p_text,240) where id=p_id;
 elsif p_action='complete' and length(trim(p_text))>0 then
   update fixer_requests set status='completed',result=p_text,progress='Complete — review proposed lines',finished_at=now() where id=p_id;
 elsif p_action='fail' then
   update fixer_requests set status='failed',error=p_text,progress='Needs attention',finished_at=now() where id=p_id;
 else return false;
 end if;
 insert into fixer_worker_health values('hermes',now()) on conflict(id) do update set seen_at=excluded.seen_at;
 return true;
end $$;

-- One transaction fences expired workers and deduplicates tool retries, including
-- after a proposal has already been approved or discarded by a person.
create function public.stage_fixer_lines(p_request uuid,p_lease uuid,p_hash text,p_lines jsonb)
returns integer language plpgsql set search_path = public as $$
declare r fixer_requests; b uuid; n integer;
begin
 select * into r from fixer_requests where id=p_request for update;
 if not found or r.status<>'running' or r.lease_token is distinct from p_lease or r.lease_until<now() or r.deadline<now()
 then raise exception 'Request lease no longer valid'; end if;
 perform 1 from estimates where id=r.estimate_id and not coalesce(is_locked,false) for update;
 if not found then raise exception 'Estimate locked or missing'; end if;
 select batch_id into b from fixer_tool_batches where request_id=p_request and payload_hash=p_hash;
 if found then select count(*) into n from estimate_line_proposals where batch_id=b; return n; end if;
 b:=gen_random_uuid();
 insert into fixer_tool_batches values(p_request,p_hash,b);
 insert into estimate_line_proposals(id,estimate_id,batch_id,fixer_request_id,description,name_status,suggested_description,
 phase,cost_code,uom,quantity,unit_cost,labor_cost,material_cost,sub_cost,markup_pct,sort_order,source,source_line_id,
 cost_item_id,comp_job_id,comp_estimate_id,comp_label,ai_rationale)
 select gen_random_uuid(),r.estimate_id,b,p_request,d.description,d.name_status,d.suggested_description,
 d.phase,d.cost_code,d.uom,d.quantity,d.unit_cost,d.labor_cost,d.material_cost,d.sub_cost,d.markup_pct,d.sort_order,
 d.source,d.source_line_id,d.cost_item_id,d.comp_job_id,d.comp_estimate_id,d.comp_label,d.ai_rationale
 from jsonb_populate_recordset(null::estimate_line_proposals,p_lines) d;
 get diagnostics n=row_count;
 return n;
end $$;

-- Human approval must also be atomic: a lost response or double click cannot add
-- the same proposed line twice. Serialize with estimate locking and proposal edits.
create function public.apply_estimate_proposals(p_ids uuid[],p_user uuid) returns jsonb
language plpgsql set search_path=public as $$
declare eid uuid; e estimates; p estimate_line_proposals; lid uuid; ord integer; output jsonb:='[]';
begin
 if (select count(distinct estimate_id) from estimate_line_proposals where id=any(p_ids))<>1 then raise exception 'Choose one estimate'; end if;
 select estimate_id into eid from estimate_line_proposals where id=any(p_ids) limit 1;
 select * into e from estimates where id=eid for update;
 if not found or e.is_locked then raise exception 'Estimate locked or missing'; end if;
 select coalesce(max(sort_order),0)+1 into ord from estimate_lines where estimate_id=eid;
 for p in select * from estimate_line_proposals where id=any(p_ids) order by sort_order,id for update loop
   if p.status='applied' then
     output:=output||coalesce((select jsonb_agg(l) from estimate_lines l where id=p.applied_line_id),'[]');
     continue;
   end if;
   if p.status<>'pending' then continue; end if;
   if p.name_status='unsourced' or length(trim(p.description))=0 then raise exception 'A proposed line still needs a name and price'; end if;
   insert into estimate_lines(estimate_id,lead_id,description,phase,cost_code,uom,quantity,unit_cost,labor_cost,material_cost,
   sub_cost,markup_pct,sort_order,source,source_line_id,cost_item_id,comp_job_id,comp_label,ai_rationale)
   values(e.id,e.lead_id,p.description,p.phase,p.cost_code,p.uom,p.quantity,p.unit_cost,p.labor_cost,p.material_cost,
   p.sub_cost,p.markup_pct,ord,p.source,p.source_line_id,p.cost_item_id,p.comp_job_id,p.comp_label,p.ai_rationale) returning id into lid;
   update estimate_line_proposals set status='applied',applied_line_id=lid,decided_by=p_user,decided_at=now() where id=p.id;
   output:=output||(select jsonb_agg(l) from estimate_lines l where id=lid); ord:=ord+1;
 end loop;
 return output;
end $$;

-- These are service-only invoker functions, never client-callable definer RPCs.
revoke all on function public.expire_fixer_requests(),public.enqueue_fixer_request(uuid,uuid,uuid,text),public.claim_fixer_request(),
 public.update_fixer_request(uuid,uuid,text,text),public.stage_fixer_lines(uuid,uuid,text,jsonb),public.apply_estimate_proposals(uuid[],uuid) from public,anon,authenticated;
grant execute on function public.expire_fixer_requests(),public.enqueue_fixer_request(uuid,uuid,uuid,text),public.claim_fixer_request(),
 public.update_fixer_request(uuid,uuid,text,text),public.stage_fixer_lines(uuid,uuid,text,jsonb),public.apply_estimate_proposals(uuid[],uuid) to service_role;
