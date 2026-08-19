-- Fix infinite recursion in RLS: admins_manage_permissions policy on
-- user_permissions queried user_permissions from within its own policy
-- (present since 001_initial_schema.sql). Any query anywhere that needed
-- RLS applied to user_permissions -- directly, or indirectly via another
-- table's policy subquerying it (budget_lines_select, schedule_select,
-- tasks_select, po_select, wo_select, etc.) -- could trip Postgres's
-- "infinite recursion detected in policy for relation user_permissions"
-- error. Observed live 2026-08-19: intermittently 500'd /api/budget,
-- /api/schedule, /api/tasks, /api/purchase-orders, /api/work-orders while
-- /api/actuals and /api/change-orders happened to succeed on the same
-- request shape -- non-deterministic, likely plan-cache dependent, which
-- made it worse than a clean failure.
--
-- Standard fix: move the self-check into a SECURITY DEFINER helper
-- function, which runs as the function owner (has BYPASSRLS in Supabase)
-- instead of the querying role, breaking the recursive cycle.

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_permissions
    where user_id = check_user_id
      and module = 'admin'
      and can_manage = true
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

drop policy if exists admins_manage_permissions on public.user_permissions;

create policy admins_manage_permissions on public.user_permissions
for all
using (public.is_admin(auth.uid()));
