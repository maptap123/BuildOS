-- Add client approval token to change_orders
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS client_token UUID DEFAULT uuid_generate_v4();
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS client_approved_at TIMESTAMPTZ;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS client_rejected_at TIMESTAMPTZ;
ALTER TABLE public.change_orders ADD COLUMN IF NOT EXISTS client_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_co_client_token ON public.change_orders(client_token);
