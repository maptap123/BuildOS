-- JDC Platform — Migration 008: User Preferences
-- Stores per-user UI preferences (e.g. default jobs filter)

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  jobs_filter JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prefs_select" ON public.user_preferences
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "prefs_insert" ON public.user_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "prefs_update" ON public.user_preferences
  FOR UPDATE USING (user_id = auth.uid());
