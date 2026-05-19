-- Schedule Item Predecessors
-- Stores FS/SS/FF/SF dependency relationships between schedule items with optional lag

CREATE TABLE public.schedule_item_predecessors (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id         UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  item_id        UUID        NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  predecessor_id UUID        NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL DEFAULT 'FS' CHECK (type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days       INTEGER     NOT NULL DEFAULT 0,
  created_by     UUID        NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, predecessor_id),
  CHECK (item_id <> predecessor_id)
);

CREATE TRIGGER schedule_item_predecessors_updated_at
  BEFORE UPDATE ON public.schedule_item_predecessors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.schedule_item_predecessors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view predecessors"
  ON public.schedule_item_predecessors FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert predecessors"
  ON public.schedule_item_predecessors FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete predecessors"
  ON public.schedule_item_predecessors FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX idx_predecessors_item_id       ON public.schedule_item_predecessors(item_id);
CREATE INDEX idx_predecessors_predecessor_id ON public.schedule_item_predecessors(predecessor_id);
CREATE INDEX idx_predecessors_job_id         ON public.schedule_item_predecessors(job_id);
