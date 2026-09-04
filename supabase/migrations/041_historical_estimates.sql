-- BuildOS — Migration 041: Historical Estimates from SharePoint
--
-- Ingests the estimate workbooks stored in SharePoint (JDC / Jobs / {Year} / {Client})
-- into queryable tables so the AI estimate generator can anchor its numbers to work
-- this company has actually priced, instead of generic US market rates.
--
-- The source workbooks use a stable 9-column sheet:
--   Cost Code | Title | Description | Unit Cost | Quantity | Unit of Measure | Total Cost | Markup | Internal Notes
-- where "Cost Code" is really "{division_num} {division_name} {cost_type}" (e.g. "14 Plumbing Materials"),
-- "Title" is the room/area (e.g. "Bath 1"), and the real cost code is the prefix of "Description"
-- (e.g. "14.1320.010 Lavatory/vanity, 21D 36W/lav 20x18").

-- ─────────────────────────────────────────────
-- HISTORICAL ESTIMATES  (one row per source workbook)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historical_estimates (
  id                 UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id             UUID        REFERENCES public.jobs(id) ON DELETE SET NULL,

  -- SharePoint provenance
  drive_id           TEXT        NOT NULL,
  item_id            TEXT        NOT NULL,
  file_name          TEXT        NOT NULL,
  web_url            TEXT,
  folder_path        TEXT,
  source_year        TEXT,       -- parsed from the folder tree, e.g. "2025"

  -- Ingest bookkeeping
  file_modified_at   TIMESTAMPTZ,
  parse_status       TEXT        NOT NULL DEFAULT 'ok'
                       CHECK (parse_status IN ('ok','quarantined','error')),
  parse_error        TEXT,
  line_count         INTEGER     NOT NULL DEFAULT 0,

  -- Denormalised rollups so matching does not need to scan every line
  total_cost         NUMERIC(14,2) NOT NULL DEFAULT 0,
  areas              TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {"Bath 1","Kitchen"}
  divisions          TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {"14 Plumbing","24 Painting"}
  -- Concatenated searchable text (areas + descriptions) used for similarity matching
  fingerprint        TEXT        NOT NULL DEFAULT '',

  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (drive_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_historical_estimates_job_id ON public.historical_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_historical_estimates_status ON public.historical_estimates(parse_status);

-- ─────────────────────────────────────────────
-- HISTORICAL ESTIMATE LINES  (one row per workbook line item)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historical_estimate_lines (
  id                     UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  historical_estimate_id UUID        NOT NULL REFERENCES public.historical_estimates(id) ON DELETE CASCADE,
  job_id                 UUID        REFERENCES public.jobs(id) ON DELETE SET NULL,

  row_number             INTEGER     NOT NULL,   -- 1-based row in the source sheet, for traceability

  cost_code              TEXT,                   -- "14.1320.010"
  division_num           TEXT,                   -- "14"
  division_name          TEXT,                   -- "Plumbing"
  cost_type              TEXT,                   -- 'labor' | 'materials' | 'subcontract' | 'equipment' | 'other'
  area                   TEXT,                   -- "Bath 1"
  description            TEXT        NOT NULL,

  uom                    TEXT        NOT NULL DEFAULT 'EA',
  quantity               NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost              NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_cost             NUMERIC(14,2) NOT NULL DEFAULT 0,
  markup_pct             NUMERIC(6,2)  NOT NULL DEFAULT 0,
  internal_notes         TEXT,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_lines_estimate  ON public.historical_estimate_lines(historical_estimate_id);
CREATE INDEX IF NOT EXISTS idx_hist_lines_job       ON public.historical_estimate_lines(job_id);
CREATE INDEX IF NOT EXISTS idx_hist_lines_cost_code ON public.historical_estimate_lines(cost_code);
CREATE INDEX IF NOT EXISTS idx_hist_lines_division  ON public.historical_estimate_lines(division_num);
CREATE INDEX IF NOT EXISTS idx_hist_lines_area      ON public.historical_estimate_lines(lower(area));

-- ─────────────────────────────────────────────
-- Similarity search over the workbook fingerprints
-- pg_trgm gives fuzzy matching on free-text scope without an embedding pipeline;
-- at a few hundred jobs this is both accurate enough and far simpler to operate.
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_historical_estimates_fingerprint_trgm
  ON public.historical_estimates USING gin (fingerprint gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_historical_estimates_fingerprint_fts
  ON public.historical_estimates USING gin (to_tsvector('english', fingerprint));

-- ─────────────────────────────────────────────
-- Cost-code rollup: "what have we actually charged for this code?"
-- Both the historical lines and cost_catalog carry the same codes, so this is an
-- exact join rather than a fuzzy one.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.cost_code_history AS
SELECT
  l.cost_code,
  l.cost_type,
  l.division_num,
  MAX(l.division_name)                                             AS division_name,
  MAX(l.description)                                               AS sample_description,
  l.uom,
  COUNT(*)                                                         AS line_count,
  COUNT(DISTINCT l.historical_estimate_id)                         AS estimate_count,
  ROUND(AVG(l.unit_cost), 4)                                       AS avg_unit_cost,
  ROUND(MIN(l.unit_cost), 4)                                       AS min_unit_cost,
  ROUND(MAX(l.unit_cost), 4)                                       AS max_unit_cost,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY l.unit_cost)::numeric, 4) AS median_unit_cost,
  ROUND(AVG(l.quantity), 4)                                        AS avg_quantity,
  ROUND(AVG(l.markup_pct), 2)                                      AS avg_markup_pct
FROM public.historical_estimate_lines l
WHERE l.cost_code IS NOT NULL AND l.unit_cost > 0
GROUP BY l.cost_code, l.cost_type, l.division_num, l.uom;

-- ─────────────────────────────────────────────
-- Provenance on generated estimate lines: where did this number come from?
-- ─────────────────────────────────────────────
ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS source       TEXT
    CHECK (source IS NULL OR source IN ('manual','catalog','assembly','ai_comp','ai_market')),
  ADD COLUMN IF NOT EXISTS comp_job_id  UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_rationale TEXT;

CREATE INDEX IF NOT EXISTS idx_estimate_lines_comp_job ON public.estimate_lines(comp_job_id);

-- ─────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS historical_estimates_updated_at ON public.historical_estimates;
CREATE TRIGGER historical_estimates_updated_at
  BEFORE UPDATE ON public.historical_estimates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─────────────────────────────────────────────
-- RLS — read follows the budget module, same as cost_catalog and estimate_lines.
-- Writes are service-role only (the sync job runs with the admin client).
-- ─────────────────────────────────────────────
ALTER TABLE public.historical_estimates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_estimate_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historical_estimates_select" ON public.historical_estimates;
CREATE POLICY "historical_estimates_select" ON public.historical_estimates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions
          WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);

DROP POLICY IF EXISTS "historical_estimate_lines_select" ON public.historical_estimate_lines;
CREATE POLICY "historical_estimate_lines_select" ON public.historical_estimate_lines FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_permissions
          WHERE user_id = auth.uid() AND module = 'budget' AND can_view = true)
);

-- ─────────────────────────────────────────────
-- Search vectors for scope → comparable matching
--
-- Two vectors, not one. A single combined vector ranked badly: a 111-line addition
-- estimate's line descriptions swamped its topic, and length normalisation over the
-- combined text then penalised exactly the big jobs that should win on a big scope.
--
--   topic_vector — what kind of job this was and which rooms it touched (weight A),
--                  plus the divisions involved (weight B). Divisions sit at B on
--                  purpose: they are generic trade words ("Wall Framing", "Plumbing")
--                  that appear in almost any scope, and at top weight they made every
--                  estimate look like a match for everything.
--   lines_vector — the individual line descriptions.
--
-- Maintained by trigger rather than as generated columns because array_to_string is
-- only STABLE, which a generated column will not accept.
-- ─────────────────────────────────────────────
ALTER TABLE public.historical_estimates
  ADD COLUMN IF NOT EXISTS topic_vector  tsvector,
  ADD COLUMN IF NOT EXISTS lines_vector  tsvector,
  ADD COLUMN IF NOT EXISTS search_vector tsvector,
  -- Short, high-signal text for the fuzzy fallback; trigram containment against a long
  -- document is noise.
  ADD COLUMN IF NOT EXISTS match_summary TEXT;

CREATE OR REPLACE FUNCTION public.historical_estimates_build_search()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  topic_text TEXT;
BEGIN
  NEW.match_summary :=
    coalesce(NEW.display_name, '') || ' ' ||
    coalesce(array_to_string(NEW.areas, ' '), '');

  topic_text := NEW.match_summary;

  -- Words shared by nearly every job describe none of them. Without this, a job titled
  -- "White Overall Remodel 2025" outranked dedicated bathroom and deck estimates on
  -- their own scopes. They stay searchable in the line vector.
  topic_text := regexp_replace(
    topic_text,
    '\y(remodel|remodels|remodeling|remodelling|renovation|renovations|reno|revised|revision|overall|complete|existing|new|job|estimate|project|20\d{2})\y',
    ' ', 'gi');

  -- "bath" and "bathroom" are different lexemes to the English stemmer, so an area named
  -- "Bath 1" never matched a scope saying "bathroom" — and areas in this data are
  -- consistently terse. Same for master/primary. Emit both forms so either phrasing hits.
  IF topic_text ~* '\ybath\y'    THEN topic_text := topic_text || ' bathroom'; END IF;
  IF topic_text ~* '\ybathroom'  THEN topic_text := topic_text || ' bath';     END IF;
  IF topic_text ~* '\ymaster\y'  THEN topic_text := topic_text || ' primary';  END IF;
  IF topic_text ~* '\yprimary\y' THEN topic_text := topic_text || ' master';   END IF;

  NEW.topic_vector :=
    setweight(to_tsvector('english', topic_text), 'A')
    || setweight(to_tsvector('english', coalesce(array_to_string(NEW.divisions, ' '), '')), 'B');

  NEW.lines_vector  := to_tsvector('english', coalesce(NEW.fingerprint, ''));
  NEW.search_vector := NEW.topic_vector || setweight(NEW.lines_vector, 'D');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS historical_estimates_search ON public.historical_estimates;
CREATE TRIGGER historical_estimates_search
  BEFORE INSERT OR UPDATE OF display_name, areas, divisions, fingerprint
  ON public.historical_estimates
  FOR EACH ROW EXECUTE FUNCTION public.historical_estimates_build_search();

CREATE INDEX IF NOT EXISTS idx_historical_estimates_topic_vector
  ON public.historical_estimates USING gin (topic_vector);
CREATE INDEX IF NOT EXISTS idx_historical_estimates_lines_vector
  ON public.historical_estimates USING gin (lines_vector);
CREATE INDEX IF NOT EXISTS idx_historical_estimates_match_summary_trgm
  ON public.historical_estimates USING gin (match_summary gin_trgm_ops);

-- ─────────────────────────────────────────────
-- Scope → comparable past estimates
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_historical_estimates(
  scope_text  TEXT,
  match_limit INT DEFAULT 8
)
RETURNS TABLE (
  historical_estimate_id UUID,
  job_id                 UUID,
  job_name               TEXT,
  client_name            TEXT,
  file_name              TEXT,
  web_url                TEXT,
  source_year            TEXT,
  city                   TEXT,
  line_count             INT,
  total_cost             NUMERIC,
  total_price            NUMERIC,
  areas                  TEXT[],
  divisions              TEXT[],
  score                  REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT
      -- OR semantics, not AND. plainto_tsquery joins every term with '&', so a scope of
      -- any real length matched nothing at all: no past estimate contains every word of
      -- a paragraph. Swapping the operator asks the question actually wanted — how much
      -- vocabulary does this estimate share with the scope — and lets ts_rank do the
      -- discriminating. Going through plainto_tsquery first means the user's text is
      -- already sanitised into lexemes before the swap.
      NULLIF(replace(plainto_tsquery('english', COALESCE(scope_text, ''))::text, ' & ', ' | '), '')::tsquery AS tsq,
      COALESCE(scope_text, '') AS raw
  )
  SELECT
    h.id,
    h.job_id,
    -- Prefer the linked job, then the estimate's own title, then the filename, so an
    -- estimate that could not be matched to a job is still usable as a comparable.
    COALESCE(j.name, h.display_name, h.file_name) AS job_name,
    h.client_name,
    h.file_name,
    h.web_url,
    COALESCE(h.source_year, to_char(h.date_started, 'YYYY')) AS source_year,
    j.city,
    h.line_count,
    h.total_cost,
    h.total_price,
    h.areas,
    h.divisions,
    (
      -- What kind of job this was. Short text, so no length normalisation: a job titled
      -- "Vetter Addition" should win an addition scope.
      0.55 * ts_rank('{0.0, 0.0, 0.35, 1.0}'::float4[], h.topic_vector, q.tsq, 0)
      -- Shared line-item vocabulary, normalised by length (flag 1, divide by
      -- 1 + log(length)) so a 111-line estimate cannot win on breadth alone.
      + 0.30 * ts_rank(h.lines_vector, q.tsq, 1)
      -- Fuzzy containment, for wording the dictionary stems differently.
      + 0.15 * word_similarity(q.raw, h.match_summary)
    )::real AS score
  FROM public.historical_estimates h
  JOIN q ON TRUE
  LEFT JOIN public.jobs j ON j.id = h.job_id
  WHERE h.parse_status = 'ok'
    AND h.line_count > 0
    AND q.tsq IS NOT NULL
    AND (
      h.topic_vector @@ q.tsq
      OR h.lines_vector @@ q.tsq
      OR word_similarity(q.raw, h.match_summary) > 0.25
    )
  ORDER BY score DESC, h.total_cost DESC
  LIMIT GREATEST(LEAST(match_limit, 25), 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_historical_estimates(TEXT, INT) TO authenticated, service_role;
