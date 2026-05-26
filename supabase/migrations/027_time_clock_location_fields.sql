-- JDC Platform — Migration 027: Time Clock GPS & Device Info
-- Adds nullable GPS/location columns and device_info to time_entries.
-- Non-destructive; safe to apply on existing data.

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS clock_in_latitude          DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_in_longitude         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_in_accuracy_meters   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_latitude         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_longitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS clock_out_accuracy_meters  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_status            TEXT
    CHECK (location_status IN ('captured', 'denied', 'unavailable', 'skipped')),
  ADD COLUMN IF NOT EXISTS device_info                JSONB;

-- Sparse index — only rows that actually have a location status
CREATE INDEX IF NOT EXISTS idx_time_entries_location_status
  ON public.time_entries(location_status)
  WHERE location_status IS NOT NULL;
