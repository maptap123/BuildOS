-- Patch: missing delete policies and all actuals policies
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- Budget lines — delete
CREATE POLICY "budget_delete" ON public.budget_lines FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_delete = true)
);

-- Schedule items — delete
CREATE POLICY "schedule_delete" ON public.schedule_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'schedule' AND can_delete = true)
);

-- Tasks — delete
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'tasks' AND can_delete = true)
);

-- Daily logs — delete
CREATE POLICY "logs_delete" ON public.daily_logs FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'logs' AND can_delete = true)
);

-- Documents — delete
CREATE POLICY "documents_delete" ON public.documents FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'documents' AND can_delete = true)
);

-- Actuals — full CRUD (budget module gates these)
CREATE POLICY "actuals_select" ON public.actuals FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);
CREATE POLICY "actuals_insert" ON public.actuals FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_create = true)
);
CREATE POLICY "actuals_update" ON public.actuals FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_edit = true)
);
CREATE POLICY "actuals_delete" ON public.actuals FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = auth.uid() AND module = 'budget' AND can_delete = true)
);
