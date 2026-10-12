-- JDC Platform — Migration 058: per-line allowances that remember their cost code
-- Estimators were typing allowances into the line notes. This gives them their own
-- field, and remembers the last allowance entered for a cost code so the next estimate
-- that uses the code starts with it filled in.

ALTER TABLE public.estimate_lines ADD COLUMN IF NOT EXISTS allowance TEXT;

-- ─────────────────────────────────────────────
-- The remembered allowance per cost code. Keyed on the normalized code (lower case,
-- no trailing dots) because the cost book writes `02.4000.` and the workbooks write
-- `02.4000` — see src/lib/estimates/costCodes.ts. Not a column on cost_catalog so a
-- code that isn't in the cost book can still remember its allowance.
-- All access goes through the API with the service role: RLS on, no policies.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cost_code_allowances (
  code_key   TEXT        PRIMARY KEY,
  allowance  TEXT        NOT NULL,
  updated_by UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cost_code_allowances ENABLE ROW LEVEL SECURITY;

-- A new line picks up its code's remembered allowance whichever path inserted it —
-- the builder, a catalog pick, an assembly or Fixer.
CREATE OR REPLACE FUNCTION public.estimate_line_default_allowance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.allowance IS NULL AND COALESCE(btrim(NEW.cost_code), '') <> '' THEN
    SELECT a.allowance INTO NEW.allowance
      FROM public.cost_code_allowances a
     WHERE a.code_key = regexp_replace(lower(btrim(NEW.cost_code)), '\.+$', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estimate_lines_default_allowance ON public.estimate_lines;

CREATE TRIGGER estimate_lines_default_allowance
  BEFORE INSERT ON public.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.estimate_line_default_allowance();
