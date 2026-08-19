-- JDC Platform - Migration 035: Unique cost_code on cost_catalog
-- Enables idempotent upsert-based seeding (scripts/import-cost-catalog.ts) — the
-- cost catalog was otherwise unconstrained and the table was empty (0 rows) despite
-- the launch plan assuming a populated cost book. Found during Week 2 Day 9 data
-- readiness audit (2026-08-19).

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_catalog_cost_code
  ON public.cost_catalog(cost_code);
