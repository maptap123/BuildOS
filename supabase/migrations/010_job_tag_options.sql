-- Migration 010: Managed job tag options
-- Strips legacy status-based tags from jobs (keeps 'buildertrend')
-- Creates a curated tag options table for the UI

-- Clean up legacy tags on all jobs — keep only 'buildertrend'
UPDATE public.jobs
SET tags = (
  SELECT COALESCE(ARRAY_AGG(t), ARRAY[]::text[])
  FROM unnest(tags) AS t
  WHERE t = 'buildertrend'
);

-- Managed tag options
CREATE TABLE IF NOT EXISTS public.job_tag_options (
  id          SERIAL       PRIMARY KEY,
  name        TEXT         NOT NULL UNIQUE,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.job_tag_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_options_select" ON public.job_tag_options
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "tag_options_insert" ON public.job_tag_options
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tag_options_delete" ON public.job_tag_options
  FOR DELETE USING (auth.uid() IS NOT NULL);

INSERT INTO public.job_tag_options (name, sort_order) VALUES
  ('buildertrend', 0),
  ('New House',    1),
  ('Addition',     2),
  ('Kitchen',      3),
  ('Bath',         4),
  ('Exterior',     5),
  ('Basement',     6),
  ('Handyman',     7),
  ('Whole House',  8)
ON CONFLICT (name) DO NOTHING;
