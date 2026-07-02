-- Revert Phase 2 (manual urgency correction). NOTE: human_urgency rows must be
-- deleted first or re-adding the narrowed CHECK fails:
--   DELETE FROM corrections WHERE correction_source = 'human_urgency';
ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_correction_source_check;
ALTER TABLE corrections
  ADD CONSTRAINT corrections_correction_source_check
  CHECK (correction_source = ANY (ARRAY['human_ui'::text, 'admin_reply'::text, 'human_skip'::text]));
ALTER TABLE corrections
  DROP COLUMN IF EXISTS correct_urgency,
  DROP COLUMN IF EXISTS original_urgency;
