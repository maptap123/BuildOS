-- Owners View: a cross-job command center for JDC's owners (live crew, job
-- tiles, margin, spend charts). It gets its own permission module so it is
-- NOT inherited from admin — only people explicitly granted it can see it.

alter table public.user_permissions drop constraint if exists user_permissions_module_check;
alter table public.user_permissions add constraint user_permissions_module_check
  check (module = any (array[
    'jobs', 'leads', 'contacts', 'vendors', 'budget', 'finance', 'profitability',
    'estimates', 'schedule', 'tasks', 'logs', 'photos', 'documents', 'time_clock',
    'admin', 'ai', 'owners'
  ]));

-- Jason Cox, Lisa Cox (owners) and August (builds and verifies the feature).
insert into public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_manage)
select u.id, 'owners', true, false, false, false, true, false
from public.users u
where u.id in (
  'ed1d11e5-5b16-4d8b-998e-a003dd6ad388',
  'faef0d74-d670-4465-b342-ca21db2c8a76',
  '0160288f-29a2-4135-9dbc-e28d23779d2b'
)
on conflict (user_id, module) do update set can_view = true, can_export = true;
