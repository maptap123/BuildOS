-- BuildOS - Migration 026: Expanded permission modules
-- Adds finer-grained Admin panel controls for Crew/mobile, office, finance, and sales tools.

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_module_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_module_check
  CHECK (module IN ('jobs','leads','contacts','vendors','budget','finance','profitability','estimates','schedule','tasks','logs','photos','documents','time_clock','admin','ai'));
