-- JDC Platform - Migration 032: Notifications v1
-- Adds a notifications table for the in-app bell (desktop header + mobile header).
-- Rows are written server-side only (service role) — no insert policy for authenticated users.
-- Discord delivery is handled in application code (src/lib/notifications), not by this migration.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN (
                            'proposal_accepted',
                            'proposal_declined',
                            'co_signed',
                            'co_rejected',
                            'lead_created',
                            'task_assigned',
                            'task_blocked',
                            'log_missing'
                          )),
  title      text        NOT NULL,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT/DELETE policy: rows are written exclusively via the service-role admin client
-- (src/lib/notifications) so the app fully controls who a notification can be written for.
