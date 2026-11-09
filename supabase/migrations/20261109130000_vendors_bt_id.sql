-- Track the BuilderTrend Subs/Vendors id on each vendor so the import is
-- idempotent (match on bt_vendor_id, never duplicate on re-run).
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS bt_vendor_id text;
CREATE UNIQUE INDEX IF NOT EXISTS vendors_bt_vendor_id_key
  ON public.vendors (bt_vendor_id) WHERE bt_vendor_id IS NOT NULL;
