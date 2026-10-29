-- Employee Fixer: private durable, read-only request queue. Apply after review.
begin;
alter table fixer_privacy_requests alter column phone drop not null;
alter table fixer_privacy_requests drop constraint fixer_privacy_requests_status_check;
update fixer_privacy_requests set status='expired' where status='approved_waiting_for_secure_worker';
alter table fixer_privacy_requests add constraint fixer_privacy_requests_status_check check(status in
 ('queued','running','held','completed','failed','denied','expired','cancelled'));
alter table fixer_privacy_requests add column scope jsonb not null default '{"category":"review","sources":[]}'::jsonb,
 add column conversation_id uuid, add column approved_scope jsonb, add column lease_token uuid,
 add column lease_until timestamptz, add column started_at timestamptz, add column finished_at timestamptz,
 add column progress text, add column result text, add column used_modules text[] not null default '{}';
create function fixer_employee_allowed(p_user uuid,p_modules text[] default '{ai}') returns boolean
language sql stable set search_path=public as $$
 select exists(select 1 from users where id=p_user and is_active) and not exists(
 select 1 from unnest(p_modules) m where not exists(select 1 from user_permissions p
 where p.user_id=p_user and p.module=m and p.can_view))
$$;
create function enqueue_fixer_employee_request(p_id uuid,p_user uuid,p_message text,p_conversation uuid)
returns jsonb language plpgsql set search_path=public as $$
declare r fixer_privacy_requests; cat text; sc jsonb; target uuid; jobids jsonb;
begin
 if not fixer_employee_allowed(p_user) then raise exception 'Requester unavailable'; end if;
 -- Routing is convenience only: the tool gateway enforces fields, grants and modules.
 cat:=case when p_message ~* '(payroll|compensation|salary|hourly|overtime|pay rate|paid per hour)' then 'compensation'
 when p_message ~* '(email|inbox|text messages|private|personal|password|credential|ignore.*instruction|system prompt|shell|browser)' then 'blocked'
 when p_message ~* '(budget|profit|margin|financial|cost|actual|spend|price|money|\mpay\M)' then 'job_finance'
 else 'operational' end;
 if cat='compensation' then
  select case when count(*)=1 then (array_agg(id))[1] end into target from users
  where is_active and length(full_name)>2 and position(lower(full_name) in lower(p_message))>0;
 end if;
 select coalesce(jsonb_agg(id),'[]'::jsonb) into jobids from jobs where position(lower(name) in lower(p_message))>0 or position(id::text in p_message)>0;
 sc:=jsonb_build_object('category',cat,'sources',case when cat='operational' then '["jobs","tasks","schedule","logs"]'::jsonb
 when cat='job_finance' then '["jobs","tasks","schedule","logs","job_finance"]'::jsonb
 when cat='compensation' and target is not null then '["compensation"]'::jsonb else '[]'::jsonb end,
 'person_id',target,'job_ids',jobids,'tools',case when cat='operational' then '["list_jobs","list_tasks","list_schedule","list_daily_logs"]'::jsonb
 when cat='compensation' then '["read_compensation"]'::jsonb
 when cat='job_finance' then '["list_jobs","list_tasks","list_schedule","list_daily_logs"]'::jsonb ||
 case when p_message ~* '(actual|spend)' and p_message !~* '(budget|profit|margin)' then '["read_job_actuals"]'::jsonb
 when p_message ~* 'budget' and p_message !~* '(actual|spend|profit|margin)' then '["read_job_finance"]'::jsonb
 else '["read_job_finance","read_job_actuals"]'::jsonb end else '[]'::jsonb end,'record_scope',case when cat='compensation' then 'one named account' else 'company jobs within current modules' end);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from fixer_privacy_requests where id=p_id;
 if found then
 if r.user_id<>p_user or r.message<>p_message or r.conversation_id is distinct from p_conversation then raise exception 'Request id already used'; end if;
 else
 insert into fixer_privacy_requests(id,user_id,phone,message,status,scope,conversation_id,expires_at)
 values(p_id,p_user,fixer_employee_unique_phone(p_user),p_message,case when cat='operational' then 'queued' else 'held' end,sc,p_conversation,now()+interval '30 minutes') returning * into r;
 if r.status='held' then insert into fixer_privacy_outbox(request_id) values(r.id); end if;
 end if;
 return jsonb_build_object('id',r.id,'status',r.status,'sms_enabled',fixer_employee_unique_phone(p_user) is not null);
end $$;
revoke all on function fixer_employee_allowed(uuid,text[]),enqueue_fixer_employee_request(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function fixer_employee_allowed(uuid,text[]),enqueue_fixer_employee_request(uuid,uuid,text,uuid) to service_role;

create table fixer_employee_delivery (
 request_id uuid primary key references fixer_privacy_requests(id),
 state text not null default 'pending' check(state in ('pending','sending','accepted','delivered','failed','unknown','cancelled')),
 lease uuid, claimed_at timestamptz, finished_at timestamptz, provider_sid text unique
);
alter table fixer_employee_delivery enable row level security;
revoke all on fixer_employee_delivery from public,anon,authenticated;
grant all on fixer_employee_delivery to service_role;
create function fixer_employee_approver() returns uuid language sql stable set search_path=public as $$
 select s.approver_user_id from fixer_privacy_settings s join users u on u.id=s.approver_user_id
 join user_permissions p on p.user_id=u.id and p.module='admin' and p.can_manage
 where s.id and u.is_active and u.phone='+15133480483'
$$;
create function fixer_employee_disclosable(p_id uuid) returns boolean language sql stable set search_path=public as $$
 select coalesce((select fixer_employee_allowed(r.user_id,array_prepend('ai',r.used_modules)) and
 (not ('admin'=any(r.used_modules)) or exists(select 1 from user_permissions where user_id=r.user_id and module='admin' and can_manage)) and
 (r.scope->>'category'='operational' or (r.decided_at is not null and r.decided_by=fixer_employee_approver() and r.approved_scope=r.scope and r.expires_at>now()))
 from fixer_privacy_requests r where r.id=p_id),false)
$$;
create function claim_fixer_employee_request() returns jsonb language plpgsql set search_path=public as $$
declare r fixer_privacy_requests;
begin
 -- Read-only work can be safely reclaimed; old process credentials are fenced.
 update fixer_privacy_requests set status='expired',lease_token=null,finished_at=now(),result=null
 where status in ('queued','running','held') and expires_at<=now();
 update fixer_privacy_requests set status='cancelled',lease_token=null,finished_at=now(),result=null
 where status in ('queued','running') and not fixer_employee_allowed(user_id);
 select * into r from fixer_privacy_requests where (status='queued' or (status='running' and lease_until<=now()))
 and expires_at>now() and fixer_employee_allowed(user_id) order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 if r.scope->>'category'<>'operational' and (r.approved_scope is distinct from r.scope or r.decided_at is null) then return null; end if;
 update fixer_privacy_requests set status='running',lease_token=gen_random_uuid(),lease_until=least(expires_at,now()+interval '90 seconds'),
 started_at=coalesce(started_at,now()),progress='Researching your question',result=null where id=r.id returning * into r;
 return jsonb_build_object('id',r.id,'message',r.message,'scope',r.scope,'lease_token',r.lease_token,'expires_at',r.expires_at);
end $$;
create function hold_fixer_employee_request(p_id uuid) returns void language plpgsql set search_path=public as $$
begin
 update fixer_privacy_requests set status='held',result=null,lease_token=null,lease_until=null,progress='Waiting for August to review access' where id=p_id and status='running';
 if found then insert into fixer_privacy_outbox(request_id) values(p_id) on conflict(request_id) do update set state='pending',lease=null,claimed_at=null,finished_at=null
 where fixer_privacy_outbox.state not in ('sending','unknown'); end if;
end $$;
create table fixer_employee_reads (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references fixer_privacy_requests(id),
 tool text not null check(length(tool)<=80),record_ids jsonb not null,allowed boolean not null default false,read_at timestamptz not null default now()
);
alter table fixer_employee_reads enable row level security;
revoke all on fixer_employee_reads from public,anon,authenticated;
grant all on fixer_employee_reads to service_role;
create function read_fixer_employee_tool(p_id uuid,p_lease uuid,p_tool text,p_params jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare r fixer_privacy_requests; m text; rows jsonb; audit_id uuid; table_name text; cols text[]; jid uuid; lim integer; offst integer;
begin
 select * into r from fixer_privacy_requests where id=p_id for update;
 if not found or r.status<>'running' or r.lease_token is distinct from p_lease or r.lease_until<=now() or r.expires_at<=now() then return jsonb_build_object('error','lease_ended'); end if;
 audit_id:=gen_random_uuid();
 insert into fixer_employee_reads(id,request_id,tool,record_ids) values(audit_id,p_id,p_tool,jsonb_build_object('job_id',p_params->>'job_id','person_id',p_params->>'person_id'));
 if not fixer_employee_disclosable(p_id) then
 perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 if r.scope->>'category' not in ('operational','job_finance','compensation') then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 m:=case p_tool when 'list_jobs' then 'jobs' when 'list_tasks' then 'tasks' when 'list_schedule' then 'schedule' when 'list_daily_logs' then 'logs' when 'read_job_finance' then 'budget' when 'read_job_actuals' then 'budget' when 'read_compensation' then 'admin' end;
 if m is null then
 perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 if jsonb_typeof(p_params)<>'object' or exists(select 1 from jsonb_object_keys(p_params) k where k not in ('job_id','person_id','limit','offset','search')) then return jsonb_build_object('error','invalid_parameters');end if;
 if exists(select 1 from jsonb_each(p_params) e where e.key in ('job_id','person_id') and (jsonb_typeof(e.value)<>'string' or e.value#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then return jsonb_build_object('error','invalid_parameters');end if;
 begin
 jid:=(p_params->>'job_id')::uuid;lim:=coalesce((p_params->>'limit')::integer,50);offst:=coalesce((p_params->>'offset')::integer,0);
 exception when others then return jsonb_build_object('error','invalid_parameters');end;
 if lim<1 or lim>100 or offst<0 or offst>100000 or length(coalesce(p_params->>'search',''))>100 or (m not in ('jobs','admin') and jid is null) then return jsonb_build_object('error','invalid_parameters');end if;

 if m in ('budget','admin') then
  if r.decided_at is null then
   -- First sensitive tool freezes exact requested category+record IDs BEFORE notice.
   if m='budget' then
    update fixer_privacy_requests set status='held',scope=jsonb_build_object('tools',jsonb_build_array(p_tool),'category','job_finance','job_ids',jsonb_build_array(jid),'sources',jsonb_build_array('job_finance')),lease_token=null,lease_until=null,result=null,progress='Waiting for August to review access' where id=p_id;
   elsif p_params->>'person_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    update fixer_privacy_requests set status='held',scope=jsonb_build_object('tools',jsonb_build_array(p_tool),'category','compensation','person_id',p_params->>'person_id','sources',jsonb_build_array('compensation')),lease_token=null,lease_until=null,result=null,progress='Waiting for August to review access' where id=p_id;
   else perform hold_fixer_employee_request(p_id);end if;
   insert into fixer_privacy_outbox(request_id) values(p_id) on conflict do nothing;
   return jsonb_build_object('error','held');
  end if;
  if r.approved_scope is distinct from r.scope or
   (m='budget' and (r.scope->>'category'<>'job_finance' or not coalesce(r.scope->'job_ids' @> jsonb_build_array(jid),false))) or
   (m='admin' and (r.scope->>'category'<>'compensation' or r.scope->>'person_id' is distinct from p_params->>'person_id'))
   then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 end if;
 if not coalesce(r.scope->'tools' ? p_tool,false) then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 if not coalesce(r.scope->'sources' ? (case m when 'budget' then 'job_finance' when 'admin' then 'compensation' else m end),false) then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;
 if not fixer_employee_allowed(r.user_id,array['ai',m]) or (m='admin' and not exists(select 1 from user_permissions where user_id=r.user_id and module='admin' and can_manage)) then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;

 if p_tool='read_job_actuals' then
  select jsonb_build_array(jsonb_build_object('job_id',jid,'total_approved_actuals',coalesce(sum(amount) filter(where status in ('approved','paid')),0))) into rows from actuals where job_id=jid;
  update fixer_privacy_requests set used_modules=array(select distinct unnest(array_append(used_modules,m))) where id=p_id;
  update fixer_employee_reads set allowed=true where id=audit_id;
  return jsonb_build_object('data',rows,'possibly_more',false);
 end if;
 -- A fixed table AND fixed output projection: never reuse broad executeTool.
 case m
 when 'jobs' then table_name:='jobs';cols:=array['id','job_number','name','status','site_address','start_date','target_completion_date'];
 when 'tasks' then table_name:='tasks';cols:=array['id','job_id','title','status','priority','due_date'];
 when 'schedule' then table_name:='schedule_items';cols:=array['id','job_id','title','status','start_date','end_date','trade','percent_complete'];
 when 'budget' then table_name:='budget_lines';cols:=array['id','job_id','revised_budget','committed_cost','forecast_cost'];
 when 'admin' then table_name:='users';cols:=array['id','full_name','hourly_rate','overtime_rate'];
 when 'logs' then table_name:='daily_logs';cols:=array['id','job_id','log_date','weather_summary','manpower_count'];
 end case;
 if m='admin' then jid:=(r.scope->>'person_id')::uuid; if jid is null then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;end if;
 -- Free-text descriptions/private notes intentionally excluded; they have no field-level sensitivity guarantees.
 execute format('select coalesce(jsonb_agg(to_jsonb(s)),''[]''::jsonb) from (select %s from %I t where ($2::uuid is null or t.%I=$2) and ($3::text is null or %s ilike ''%%''||$3||''%%'') order by t.id limit $4 offset $5) s', (select string_agg(format('t.%I',c),',') from unnest(cols) c), table_name, case when m in ('jobs','admin') then 'id' else 'job_id' end,case when m='jobs' then 't.name' else 'null::text' end)
 into rows using cols,jid,p_params->>'search',lim,offst;
 update fixer_privacy_requests set used_modules=array(select distinct unnest(array_append(used_modules,m))) where id=p_id;
 update fixer_employee_reads set allowed=true where id=audit_id;
 return jsonb_build_object('data',rows,'limit',lim,'offset',offst,'possibly_more',jsonb_array_length(rows)=lim);
end $$;
create function update_fixer_employee_request(p_id uuid,p_lease uuid,p_action text,p_text text) returns boolean
language plpgsql set search_path=public as $$
declare r fixer_privacy_requests;
begin
 select * into r from fixer_privacy_requests where id=p_id for update;
 if not found or r.lease_token is distinct from p_lease or p_lease is null then return false;end if;
 if r.status='completed' then return p_action='complete' and r.result=p_text and fixer_employee_disclosable(p_id);end if;
 if r.status<>'running' or r.lease_until<=now() or r.expires_at<=now() then return false;end if;
 if not fixer_employee_disclosable(p_id) then perform hold_fixer_employee_request(p_id);return false;end if;
 if p_action='heartbeat' then update fixer_privacy_requests set lease_until=least(expires_at,now()+interval '90 seconds') where id=p_id;return true;end if;
 if p_action not in ('complete','fail','hold') then return false;end if;
 if p_action='hold' then perform hold_fixer_employee_request(p_id);return true;end if;
 if p_text is null or length(trim(p_text)) not between 1 and 20000 then return false;end if;
 update fixer_privacy_requests set status=case when p_action='complete' then 'completed' else 'failed' end,
 result=case when p_action='complete' then p_text else null end,finished_at=now(),progress=case when p_action='complete' then 'Answer ready' else 'Research could not finish; please try again' end where id=p_id;
 if p_action='complete' then insert into fixer_employee_delivery(request_id) values(p_id) on conflict do nothing;end if;
 return true;
end $$;
create function list_fixer_employee_requests(p_user uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(row order by row->>'created_at' desc),'[]'::jsonb) from (
 select jsonb_build_object('id',id,'status',case when status in ('queued','running','held') and expires_at<=now() then 'expired' else status end,
 'created_at',created_at,'finished_at',finished_at,'conversationId',conversation_id,'progress',case when status='completed' and not fixer_employee_disclosable(id) then 'Access changed; answer unavailable' else progress end)
 ||case when status='completed' and fixer_employee_disclosable(id) then jsonb_build_object('result',result) else '{}'::jsonb end row
 from fixer_privacy_requests where user_id=p_user and fixer_employee_allowed(p_user) order by created_at desc limit 50) s
$$;
revoke all on function fixer_employee_disclosable(uuid),claim_fixer_employee_request(),hold_fixer_employee_request(uuid),read_fixer_employee_tool(uuid,uuid,text,jsonb),update_fixer_employee_request(uuid,uuid,text,text),list_fixer_employee_requests(uuid) from public,anon,authenticated;
grant execute on function fixer_employee_disclosable(uuid),claim_fixer_employee_request(),hold_fixer_employee_request(uuid),read_fixer_employee_tool(uuid,uuid,text,jsonb),update_fixer_employee_request(uuid,uuid,text,text),list_fixer_employee_requests(uuid) to service_role;

create or replace function decide_fixer_privacy_request(p_id uuid,p_from text,p_approve boolean,p_sid text) returns boolean
language plpgsql set search_path=public as $$
declare r fixer_privacy_requests; owner_id uuid;
begin
 if p_from is distinct from '+15133480483' or p_sid is null or p_sid !~ '^SM[0-9a-fA-F]{32}$' or p_approve is null then return false;end if;
 owner_id:=fixer_employee_approver();if owner_id is null then return false;end if;
 select * into r from fixer_privacy_requests where id=p_id for update;
 if not found or r.expires_at<=now() or not fixer_employee_allowed(r.user_id) then return false;end if;
 if r.decided_at is not null then return r.decision_sid=p_sid and r.decided_by=owner_id and (r.approved_scope is not null)=p_approve;end if;
 if r.status<>'held' or exists(select 1 from fixer_privacy_requests where decision_sid=p_sid) then return false;end if;
 begin
 update fixer_privacy_requests set status=case when p_approve then 'queued' else 'denied' end,decided_by=owner_id,
 decided_at=now(),approved_scope=case when p_approve then scope else null end,decision_sid=p_sid,
 finished_at=case when p_approve then null else now() end where id=p_id;
 exception when unique_violation then return false;end;
 return true;
end $$;
create or replace function claim_fixer_privacy_notice() returns jsonb language plpgsql set search_path=public as $$
declare n fixer_privacy_outbox; r fixer_privacy_requests; fullname text;
begin
 update fixer_privacy_outbox set state='unknown',finished_at=now() where state='sending' and claimed_at<now()-interval '2 minutes';
 update fixer_privacy_requests set status='expired',finished_at=now() where status='held' and expires_at<=now();
 update fixer_privacy_outbox o set state='cancelled',finished_at=now() where state='pending' and not exists(select 1 from fixer_privacy_requests req where req.id=o.request_id and req.status='held' and req.decided_at is null);
 if fixer_employee_approver() is null then return null;end if;
 select o.* into n from fixer_privacy_outbox o join fixer_privacy_requests req on req.id=o.request_id
 where o.state='pending' and req.status='held' and req.decided_at is null and req.expires_at>now() and fixer_employee_allowed(req.user_id)
 order by req.created_at for update of o skip locked limit 1;
 if not found then return null;end if;
 update fixer_privacy_outbox set state='sending',lease=gen_random_uuid(),claimed_at=now() where request_id=n.request_id returning * into n;
 select * into r from fixer_privacy_requests where id=n.request_id;select full_name into fullname from users where id=r.user_id;
 return jsonb_build_object('request_id',r.id,'full_name',fullname,'user_id',r.user_id,'message',r.message,'scope',r.scope,'lease',n.lease);
end $$;
create function fixer_employee_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if new.phone is distinct from old.phone or new.user_id is distinct from old.user_id or new.message is distinct from old.message or new.conversation_id is distinct from old.conversation_id
 or (new.scope is distinct from old.scope and (old.decided_at is not null or old.status<>'running' or new.status<>'held'))
 then raise exception 'Request identity, question and reviewed scope are immutable';end if;
 return new;
end $$;
create trigger fixer_employee_immutable before update on fixer_privacy_requests for each row execute function fixer_employee_immutable();
revoke all on function fixer_employee_approver(),fixer_employee_immutable() from public,anon,authenticated;
grant execute on function fixer_employee_approver(),fixer_employee_immutable() to service_role;

alter table fixer_employee_delivery add column destination text;
create function fixer_employee_phone(raw text) returns text language sql immutable as $$
 select case when raw ~ '^\s*\+[0-9 () .-]+\s*$' and regexp_replace(raw,'[^0-9]','','g') ~ '^[1-9][0-9]{7,14}$' then '+'||regexp_replace(raw,'[^0-9]','','g')
 when raw ~ '^[0-9 () .-]+$' and length(regexp_replace(raw,'[^0-9]','','g'))=10 then '+1'||regexp_replace(raw,'[^0-9]','','g')
 when raw ~ '^[0-9 () .-]+$' and regexp_replace(raw,'[^0-9]','','g') ~ '^1[0-9]{10}$' then '+'||regexp_replace(raw,'[^0-9]','','g') end
$$;
create function fixer_employee_unique_phone(p_user uuid) returns text language sql stable set search_path=public as $$
 select case when count(*)=1 then max(fixer_employee_phone(u.phone)) end from users u
 where u.is_active and fixer_employee_phone(u.phone) is not null and fixer_employee_phone(u.phone)=(select fixer_employee_phone(phone) from users where id=p_user and is_active)
$$;
create function authorize_fixer_employee_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql set search_path=public as $$
declare d fixer_employee_delivery; r fixer_privacy_requests; phone text;
begin
 select * into d from fixer_employee_delivery where request_id=p_id for update;
 if not found or d.lease is distinct from p_lease or d.state<>'sending' or d.claimed_at<now()-interval '1 minute' then return null;end if;
 select * into r from fixer_privacy_requests where id=p_id;
 phone:=fixer_employee_unique_phone(r.user_id);
 if r.status<>'completed' or not fixer_employee_disclosable(p_id) or phone is null or phone is distinct from d.destination or phone is distinct from r.phone then
 update fixer_employee_delivery set state='cancelled',finished_at=now() where request_id=p_id;return null;end if;
 return jsonb_build_object('request_id',r.id,'lease',d.lease,'phone',phone,'body',case when r.scope->>'category'='operational' and length(r.result)<=1200 then r.result else 'Your Fixer answer is ready. Open BuildOS and sign in to read it.' end);
end $$;
create function claim_fixer_employee_delivery() returns jsonb language plpgsql set search_path=public as $$
declare d fixer_employee_delivery; rec fixer_privacy_requests; phone text;
begin
 update fixer_employee_delivery set state='unknown',finished_at=now() where state='sending' and claimed_at<now()-interval '2 minutes';
 -- Reconcile known provider IDs by safe GET only. Never resubmit an SMS.
 select * into d from fixer_employee_delivery where state='accepted' and (claimed_at is null or claimed_at<now()-interval '30 seconds') order by finished_at for update skip locked limit 1;
 if found then
 update fixer_employee_delivery set claimed_at=now() where request_id=d.request_id;
 return jsonb_build_object('action','reconcile','request_id',d.request_id,'lease',d.lease,'provider_sid',d.provider_sid,'phone',d.destination);end if;
 select * into d from fixer_employee_delivery where state='pending' order by request_id for update skip locked limit 1;
 if not found then return null;end if;
 select * into rec from fixer_privacy_requests where id=d.request_id;
 phone:=fixer_employee_unique_phone(rec.user_id);
 if rec.status<>'completed' or not fixer_employee_disclosable(rec.id) or phone is null or phone is distinct from rec.phone then
 update fixer_employee_delivery set state='cancelled',finished_at=now() where request_id=d.request_id;return null;end if;
 update fixer_employee_delivery set state='sending',lease=gen_random_uuid(),destination=phone,claimed_at=now() where request_id=d.request_id returning * into d;
 return authorize_fixer_employee_delivery(d.request_id,d.lease)||jsonb_build_object('action','send');
end $$;
create function finish_fixer_employee_delivery(p_id uuid,p_lease uuid,p_state text,p_sid text) returns boolean language plpgsql set search_path=public as $$
begin
 if p_state not in ('accepted','delivered','failed','unknown') or (p_state in ('accepted','delivered') and (p_sid is null or p_sid !~ '^SM[0-9a-fA-F]{32}$')) then return false;end if;
 update fixer_employee_delivery set state=p_state,provider_sid=coalesce(provider_sid,p_sid),finished_at=now(),claimed_at=case when p_state='accepted' then null else claimed_at end
 where request_id=p_id and lease=p_lease and state in ('sending','accepted') and (provider_sid is null or provider_sid=p_sid);
 return found;
end $$;
revoke all on function fixer_employee_phone(text),fixer_employee_unique_phone(uuid),authorize_fixer_employee_delivery(uuid,uuid),claim_fixer_employee_delivery(),finish_fixer_employee_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function fixer_employee_phone(text),fixer_employee_unique_phone(uuid),authorize_fixer_employee_delivery(uuid,uuid),claim_fixer_employee_delivery(),finish_fixer_employee_delivery(uuid,uuid,text,text) to service_role;
commit;
