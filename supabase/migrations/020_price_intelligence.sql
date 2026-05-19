-- JDC Platform — Migration 018: Material Price Intelligence
-- Phase 5a: Apify price scraping foundation
-- Run: supabase db push

-- ─────────────────────────────────────────────────────────────────
-- PRICE CACHE
-- Stores scraped material prices from external retailers.
-- 24-hour TTL: check scraped_at < NOW() - INTERVAL '24 hours'
-- before calling Apify again (enforced in application code).
--
-- Retailer values (Phase 5a+): 'home_depot', 'lowes', 'sherwin_williams',
--   '84_lumber', 'ferguson', 'fastenal', 'menards', 'other'
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.price_cache (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  query        TEXT        NOT NULL,               -- normalised search string
  retailer     TEXT        NOT NULL,               -- e.g. 'home_depot'
  product_name TEXT        NOT NULL,
  sku          TEXT,                               -- retailer SKU / item number
  price_cents  INTEGER     NOT NULL,               -- price in US cents (avoid float)
  unit         TEXT,                               -- 'each', 'sq ft', 'gal', 'LF', etc.
  url          TEXT,                               -- direct product page URL
  store_number TEXT,                               -- store / location identifier
  zip_code     TEXT,                               -- ZIP used to look up local pricing
  scraped_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- when the price was fetched from retailer
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

-- Price data is read-only for regular users; writes go through service role only.
CREATE POLICY "price_cache_select" ON public.price_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'budget'
        AND can_view = true
    )
  );

-- Indexes for cache-first lookup (query + retailer + zip + freshness check)
CREATE INDEX IF NOT EXISTS idx_price_cache_query_retailer ON public.price_cache(query, retailer);
CREATE INDEX IF NOT EXISTS idx_price_cache_retailer       ON public.price_cache(retailer);
CREATE INDEX IF NOT EXISTS idx_price_cache_zip_code       ON public.price_cache(zip_code);
CREATE INDEX IF NOT EXISTS idx_price_cache_scraped_at     ON public.price_cache(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_cache_sku            ON public.price_cache(sku) WHERE sku IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- MATERIALS LIBRARY
-- Org-level saved materials catalogue. Acts as the "known items"
-- list that the estimate builder pulls from and that the nightly
-- price refresh re-scrapes (Phase 5d).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.materials_library (
  id                    UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id                TEXT        NOT NULL,       -- placeholder until multi-tenant org table exists; use 'default' for now
  name                  TEXT        NOT NULL,
  category              TEXT,                       -- 'lumber', 'concrete', 'paint', 'fasteners', 'plumbing', 'electrical', etc.
  default_unit          TEXT,                       -- 'each', 'LF', 'sq ft', 'gal', 'lb', etc.
  last_known_price_cents INTEGER,                   -- most recent scraped price in US cents
  last_retailer         TEXT,                       -- retailer where last_known_price was found
  last_scraped_at       TIMESTAMPTZ,                -- when the price was last refreshed
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER materials_library_updated_at
  BEFORE UPDATE ON public.materials_library
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.materials_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_library_select" ON public.materials_library
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'budget'
        AND can_view = true
    )
  );

CREATE POLICY "materials_library_insert" ON public.materials_library
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'budget'
        AND can_create = true
    )
  );

CREATE POLICY "materials_library_update" ON public.materials_library
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'budget'
        AND can_edit = true
    )
  );

CREATE POLICY "materials_library_delete" ON public.materials_library
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND module = 'budget'
        AND can_delete = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_materials_org_id   ON public.materials_library(org_id);
CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials_library(category);
CREATE INDEX IF NOT EXISTS idx_materials_name     ON public.materials_library USING gin(to_tsvector('english', name));
