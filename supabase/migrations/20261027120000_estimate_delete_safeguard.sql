-- Preserve estimate history atomically, including concurrent INSERT/UPDATE writers.
-- Native RESTRICT FKs use PostgreSQL's referential-integrity locking/snapshots,
-- rather than a preflight SELECT or custom cross-table snapshot/lock protocol.
-- Only editable draft contents (line_items/estimate_lines) retain CASCADE.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.fixer_requests DROP CONSTRAINT fixer_requests_estimate_id_fkey,
  ADD CONSTRAINT fixer_requests_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;
ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_estimate_id_fkey,
  ADD CONSTRAINT chat_messages_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;
ALTER TABLE public.estimate_proposal_sessions DROP CONSTRAINT estimate_proposal_sessions_estimate_id_fkey,
  ADD CONSTRAINT estimate_proposal_sessions_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;
ALTER TABLE public.estimate_line_proposals DROP CONSTRAINT estimate_line_proposals_estimate_id_fkey,
  ADD CONSTRAINT estimate_line_proposals_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;
ALTER TABLE public.allowances DROP CONSTRAINT allowances_estimate_line_id_fkey,
  ADD CONSTRAINT allowances_estimate_line_id_fkey FOREIGN KEY (estimate_line_id) REFERENCES public.estimate_lines(id) ON DELETE RESTRICT;

-- The existing budget importer writes provenance in notes. A generated FK means
-- all import writers (including UPDATE of notes) coordinate with DELETE without
-- application changes. Ordinary/manual notes generate NULL. No notes are changed.
ALTER TABLE public.budget_lines ADD COLUMN imported_estimate_id uuid GENERATED ALWAYS AS (
  substring(notes from '^Imported from estimate ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})')::uuid
) STORED;
CREATE INDEX budget_lines_imported_estimate_id_idx ON public.budget_lines(imported_estimate_id) WHERE imported_estimate_id IS NOT NULL;
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_imported_estimate_id_fkey
  FOREIGN KEY (imported_estimate_id) REFERENCES public.estimates(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.budget_lines.imported_estimate_id IS 'Derived from legacy import notes; RESTRICT FK prevents deleting imported estimates, including concurrent imports.';

-- Also enforce lifecycle protection for direct SQL/cascaded deletes. This function
-- reads OLD only: no elevated privileges, RLS bypass, or public callable RPC.
CREATE FUNCTION public.guard_estimate_deletion() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' OR OLD.is_locked IS DISTINCT FROM false
    OR OLD.client_approved_at IS NOT NULL OR OLD.client_rejected_at IS NOT NULL
    OR OLD.client_name IS NOT NULL OR OLD.client_signature IS NOT NULL
    OR OLD.client_response_note IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This estimate is protected and cannot be deleted. Refresh to see its current state.',
      CONSTRAINT = 'estimates_delete_draft_only';
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_estimate_deletion() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER estimates_delete_draft_only BEFORE DELETE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.guard_estimate_deletion();
COMMIT;
