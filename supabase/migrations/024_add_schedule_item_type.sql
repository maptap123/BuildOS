ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'phase' CHECK (type IN ('phase', 'milestone'));
