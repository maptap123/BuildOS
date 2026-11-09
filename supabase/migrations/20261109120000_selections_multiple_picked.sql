-- A selection can now hold several chosen items (e.g. three faucets entered on one
-- "Plumbing fixtures" selection). Drops the one-picked-per-selection rule from 059.
DROP INDEX IF EXISTS public.selection_choices_one_selected;
