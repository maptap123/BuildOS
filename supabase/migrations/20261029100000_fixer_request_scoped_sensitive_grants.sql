-- A reviewed answer grants only its frozen sensitive source, never permanent modules.
-- Ordinary module reads and current active/AI/base job access remain mandatory.
begin;
create function fixer_employee_scoped_grant(p_id uuid,p_module text) returns boolean
language sql stable set search_path=public as $$
 select coalesce((select
  r.decided_at is not null and r.decided_by is not null and
  r.decided_by=fixer_employee_approver() and r.approved_scope=r.scope and r.expires_at>now() and
  fixer_employee_allowed(r.user_id,array['ai','jobs']) and
  case p_module
   when 'budget' then r.scope->>'category'='job_finance' and
    coalesce(r.scope->'sources' ? 'job_finance',false) and
    jsonb_typeof(r.scope->'job_ids')='array' and jsonb_array_length(r.scope->'job_ids')>0 and
    not exists(select 1 from jsonb_array_elements_text(r.scope->'job_ids') j where j !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') and
    (coalesce(r.scope->'tools' ? 'read_job_finance',false) or coalesce(r.scope->'tools' ? 'read_job_actuals',false))
   when 'admin' then r.scope->>'category'='compensation' and
    coalesce(r.scope->'sources' ? 'compensation',false) and
    r.scope->>'person_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and
    coalesce(r.scope->'tools' ? 'read_compensation',false)
   else false end
 from fixer_privacy_requests r where r.id=p_id),false)
$$;
create or replace function fixer_employee_disclosable(p_id uuid) returns boolean
language sql stable set search_path=public as $$
 select coalesce((select fixer_employee_allowed(r.user_id) and
  case r.scope->>'category'
   when 'operational' then true
   when 'job_finance' then fixer_employee_scoped_grant(p_id,'budget')
   when 'compensation' then fixer_employee_scoped_grant(p_id,'admin')
   else false end and
  not exists(select 1 from unnest(r.used_modules) m where
   case when m in ('budget','admin') then not fixer_employee_scoped_grant(p_id,m)
   else not fixer_employee_allowed(r.user_id,array['ai',m]) end)
 from fixer_privacy_requests r where r.id=p_id),false)
$$;
create or replace function enqueue_fixer_employee_request(p_id uuid,p_user uuid,p_message text,p_conversation uuid)
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
 if cat='compensation' and target is null then raise exception 'Name exactly one employee by full name for compensation access.';end if;
 if cat='job_finance' and jsonb_array_length(jobids)=0 then raise exception 'Name the job for financial access.';end if;
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
create or replace function read_fixer_employee_tool(p_id uuid,p_lease uuid,p_tool text,p_params jsonb) returns jsonb
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
 if not fixer_employee_allowed(r.user_id) or
 (m in ('budget','admin') and not fixer_employee_scoped_grant(p_id,m)) or
 (m not in ('budget','admin') and not fixer_employee_allowed(r.user_id,array['ai',m])) then perform hold_fixer_employee_request(p_id);return jsonb_build_object('error','held');end if;

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
 -- Operational text is untrusted and may embed sensitive facts. Do not send it
 -- to the model or let a generic approval release it. Structured money/pay
 -- tools remain the only approvable financial projections.
 if m not in ('budget','admin') and coalesce(rows::text ~* '(\m(payroll|salary|compensation|hourly|overtime|budget|profit|margin|financial|bank|banking|ssn|password|credential|cost|price|paid|wages|pay|email|inbox|private|personal|text messages|account number|routing number|credit card|social security|system prompt|ignore.*instruction)\M|[$€£][[:space:]]*[0-9]|[0-9][[:space:]]*(dollars|per hour))',false) then
  update fixer_privacy_requests set status='held',scope=jsonb_build_object('category','blocked','sources','[]'::jsonb,'tools','[]'::jsonb,'reason','restricted_free_text'),lease_token=null,lease_until=null,result=null where id=p_id;
  update fixer_privacy_requests set status='failed',finished_at=now(),progress='This record contains restricted financial or personal text. Ask for an exact job financial figure or named employee rate instead.' where id=p_id;
  return jsonb_build_object('error','restricted_content');
 end if;
 update fixer_privacy_requests set used_modules=array(select distinct unnest(array_append(used_modules,m))) where id=p_id;
 update fixer_employee_reads set allowed=true where id=audit_id;
 return jsonb_build_object('data',rows,'limit',lim,'offset',offst,'possibly_more',jsonb_array_length(rows)=lim);
end $$;
revoke all on function fixer_employee_scoped_grant(uuid,text) from public,anon,authenticated;
grant execute on function fixer_employee_scoped_grant(uuid,text) to service_role;
commit;
