-- JDC Platform - Migration 034: Security repair — leads/vendors RLS module mismatch
-- Found during Week 2 Day 8 permissions QA audit (2026-08-19).
--
-- leads_select/update/delete checked user_permissions.module = 'jobs' instead of
-- 'leads' — every crew user with jobs.can_view (which is everyone, they need their
-- job list) could read/edit/delete the sales pipeline (client PII + deal $) directly
-- via PostgREST, bypassing the nav's own leads.view gate. Matches the API-layer fix
-- applied in src/app/api/leads/**.
--
-- vendors had a single wide-open policy — "Authenticated users can manage vendors"
-- USING (true) FOR ALL — meaning any authenticated user could select/insert/update/
-- delete every vendor record with no permission check at all. Replaced with proper
-- per-action, module-gated policies matching the API-layer fix in src/app/api/vendors/**.
--
-- Neither table is queried by the browser (anon-key) client anywhere in the app —
-- confirmed via grep — so this is a pure hardening change with no app behavior change.
-- Both policy sets bypass for admins (admin.can_manage), matching the app's
-- isAdmin() || can(...) convention everywhere else.

-- ── leads ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_select" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
DROP POLICY IF EXISTS "leads_delete" ON public.leads;

CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'leads' AND can_view = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'leads' AND can_edit = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'leads' AND can_delete = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

-- ── vendors ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can manage vendors" ON public.vendors;

CREATE POLICY "vendors_select" ON public.vendors FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'vendors' AND can_view = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "vendors_insert" ON public.vendors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'vendors' AND can_create = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "vendors_update" ON public.vendors FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'vendors' AND can_edit = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);

CREATE POLICY "vendors_delete" ON public.vendors FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'vendors' AND can_delete = true) OR
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'admin' AND can_manage = true)
);
