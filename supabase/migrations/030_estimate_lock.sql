-- Add is_locked flag to estimates
-- When locked, line items and estimate fields cannot be edited through the UI

alter table estimates
  add column if not exists is_locked    boolean not null default false,
  add column if not exists locked_at    timestamptz,
  add column if not exists locked_by    uuid references auth.users(id);
