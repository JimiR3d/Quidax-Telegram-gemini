-- Revert: restore the original two-value correction_source CHECK constraint.
-- NOTE: this will fail if any 'human_skip' rows still exist — delete them first
--   (DELETE FROM corrections WHERE correction_source = 'human_skip';) before
--   running this down migration.
ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_correction_source_check;
ALTER TABLE corrections
  ADD CONSTRAINT corrections_correction_source_check
  CHECK (correction_source = ANY (ARRAY['human_ui'::text, 'admin_reply'::text]));
