-- Shared seed for manual/accepted-proposal conversion. No changes to historical rows.
create function public.ensure_lead_conversion_job(p_lead_id uuid,p_actor uuid,p_seed jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare l leads%rowtype; j jobs%rowtype; num text;
begin
  if not exists(select 1 from users u join user_permissions p on p.user_id=u.id where u.id=p_actor and u.is_active and p.module='jobs' and p.can_create) then raise exception 'Job creation permission required'; end if;
  select * into l from leads where id=p_lead_id for update;
  if l.id is null then raise exception 'Lead not found'; end if;
  if l.converted_job_id is not null then
    select * into j from jobs where id=l.converted_job_id;
    if j.id is null then raise exception 'Converted job missing'; end if;
    return to_jsonb(j);
  end if;
  -- Recover an old partial conversion, but never guess between existing jobs.
  if (select count(*) from jobs where lead_id=p_lead_id)>1 then raise exception 'Several jobs exist for this lead; office review required'; end if;
  select * into j from jobs where lead_id=p_lead_id limit 1;
  if j.id is null then
    perform pg_advisory_xact_lock(hashtextextended('buildos-conversion-job-number',0));
    select 'JDC-'||extract(year from current_date)::text||'-'||lpad((count(*)+1)::text,3,'0') into num from jobs;
    insert into jobs(job_number,name,description,client_name,client_email,client_phone,site_address,status,contract_amount,estimated_cost,tags,lead_id,created_by,qb_sync_status,closeout_checklist)
    values(num,coalesce(nullif(trim(p_seed->>'name'),''),trim(l.title)),coalesce(p_seed->>'description',nullif(trim(l.notes),'')),
      coalesce(nullif(trim(l.client_name),''),'Unknown'),nullif(trim(l.client_email),''),nullif(trim(l.client_phone),''),coalesce(nullif(trim(l.address),''),'TBD'),
      case when p_seed->>'status'='active' then 'active' else 'presale' end,
      coalesce((p_seed->>'contract_amount')::numeric,l.estimated_value),(p_seed->>'estimated_cost')::numeric,'{}',l.id,p_actor,'not_synced','{}') returning * into j;
  end if;
  update leads set converted_job_id=j.id,status='won' where id=l.id;
  return to_jsonb(j);
end $$;
revoke all on function public.ensure_lead_conversion_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ensure_lead_conversion_job(uuid,uuid,jsonb) to service_role;
