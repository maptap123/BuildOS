-- Selections share link + client comments.
-- One public link per job (anyone with it can view the selections and comment, no login).
-- Comments from the link and replies from staff share one thread per job; a comment can
-- optionally point at one selection. All access goes through the API with the service
-- role: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.selection_share_links (
  job_id      UUID        PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  token       UUID        NOT NULL DEFAULT uuid_generate_v4(),
  created_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS selection_share_links_token_key ON public.selection_share_links (token);
ALTER TABLE public.selection_share_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.selection_comments (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id        UUID        NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  selection_id  UUID        REFERENCES public.selections(id) ON DELETE SET NULL,
  author_type   TEXT        NOT NULL CHECK (author_type IN ('client','staff')),
  author_name   TEXT        NOT NULL,
  author_user_id UUID       REFERENCES public.users(id) ON DELETE SET NULL,
  body          TEXT        NOT NULL,
  -- Staff have seen a client comment (only meaningful for author_type = 'client').
  staff_read_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS selection_comments_job_idx ON public.selection_comments (job_id, created_at);
ALTER TABLE public.selection_comments ENABLE ROW LEVEL SECURITY;
