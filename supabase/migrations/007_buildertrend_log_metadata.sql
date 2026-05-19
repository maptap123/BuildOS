ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS bt_log_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_bt_log_id
  ON public.daily_logs(bt_log_id)
  WHERE bt_log_id IS NOT NULL;

ALTER TABLE public.log_photos
  ADD COLUMN IF NOT EXISTS bt_log_id TEXT;

CREATE INDEX IF NOT EXISTS idx_log_photos_bt_log_id
  ON public.log_photos(bt_log_id)
  WHERE bt_log_id IS NOT NULL;
