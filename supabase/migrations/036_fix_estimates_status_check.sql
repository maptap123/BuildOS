-- JDC Platform - Migration 036: Fix estimates.status CHECK constraint
-- Found during Week 2 Day 10 smoke testing (2026-08-19): the live constraint only allowed
-- 'draft','in_review','approved','exported' — stale values from whatever created the
-- `estimates` table originally (no local migration file defines it; it exists on the live
-- DB as "create_estimating_tables", never captured back into this repo). The app's actual
-- EstimateStatus type (src/types/index.ts) and every usage — the estimate builder's "Send"
-- button (EstimateBuilderClient.tsx:498), the public proposal accept/decline API
-- (src/app/api/proposals/client/[token]/route.ts) — use 'draft'|'sent'|'approved'|
-- 'rejected'|'voided'. 'in_review' and 'exported' are referenced nowhere in the codebase.
--
-- Practical impact before this fix: clicking "Send" on any estimate, or a client declining
-- a sent proposal, would throw a DB constraint violation — the estimate → proposal → accept
-- → job money path was broken end to end. Caught by tests/money-path-proposal-accept.spec.ts.

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_status_check;

ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'voided'));
