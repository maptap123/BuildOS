-- JDC Platform - Migration 033: Security repair — restore/add RLS
-- Found via Supabase security advisor during Week 2 notifications work (2026-08-19):
-- three public tables were reachable via PostgREST with RLS fully disabled, meaning
-- any authenticated (or anon, if the key ever leaks) client could read/write them
-- directly, bypassing every permission check the app's API routes enforce.
--
--   time_entries         — RLS + all 4 policies from migration 011 were gone on the
--                          live DB (table was rebuilt by a later schema-fix migration
--                          that never restored them). Contains labor_cost, hourly_rate,
--                          GPS clock-in/out coordinates for every crew member.
--   job_file_permissions — never had RLS enabled since creation (029).
--   job_external_links   — never had RLS enabled since creation (028).
--
-- Both job_file_permissions and job_external_links are read/written exclusively via
-- server routes using the service-role admin client (confirmed: no client-side query
-- against either table), so they get a full lockdown — only the admin module and the
-- service role (which always bypasses RLS) can touch them.

-- ── time_entries: restore the original 011 policy set ──────────────────────────
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "te_select" ON public.time_entries;
DROP POLICY IF EXISTS "te_insert" ON public.time_entries;
DROP POLICY IF EXISTS "te_update" ON public.time_entries;
DROP POLICY IF EXISTS "te_delete" ON public.time_entries;

CREATE POLICY "te_select" ON public.time_entries FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "te_insert" ON public.time_entries FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "te_update" ON public.time_entries FOR UPDATE USING (
  (user_id = auth.uid() AND approval_status = 'pending') OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "te_delete" ON public.time_entries FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- ── job_file_permissions: admin-only, server writes only ───────────────────────
ALTER TABLE public.job_file_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jfp_admin_all" ON public.job_file_permissions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- ── job_external_links: admin-only, server writes only ──────────────────────────
ALTER TABLE public.job_external_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jel_admin_all" ON public.job_external_links FOR ALL USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);
