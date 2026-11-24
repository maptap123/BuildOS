-- Selections gets its own permission module (it used to ride on Budget).
-- It is a three-checkbox module: View / Create / Edit. Edit implies delete,
-- export and manage, so those columns just mirror can_edit.

alter table public.user_permissions drop constraint if exists user_permissions_module_check;
alter table public.user_permissions add constraint user_permissions_module_check
  check (module = any (array[
    'jobs', 'leads', 'contacts', 'vendors', 'budget', 'finance', 'profitability',
    'estimates', 'schedule', 'tasks', 'logs', 'photos', 'documents', 'time_clock',
    'admin', 'ai', 'owners', 'selections'
  ]));

-- Keep everyone's current access: whoever could use Selections through Budget
-- gets the same View/Create/Edit on the new module.
insert into public.user_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_manage)
select user_id, 'selections',
       can_view,
       can_create,
       can_edit and can_delete,
       can_edit and can_delete,
       can_edit and can_delete,
       can_edit and can_delete
from public.user_permissions
where module = 'budget'
on conflict (user_id, module) do nothing;
