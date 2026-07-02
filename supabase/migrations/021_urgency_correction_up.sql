-- Phase 2 (manual urgency correction): nullable urgency columns on corrections
-- + a fourth correction_source, 'human_urgency' (dashboard-only urgency change;
-- category columns are stamped original = correct as a placeholder, category
-- NOT reviewed). NULL urgency columns mean "urgency not reviewed" (all
-- historical rows, and human_skip rows). No CHECK on urgency values — the
-- server validates against VALID_URGENCIES (same rationale as category in 010).
ALTER TABLE corrections
  ADD COLUMN original_urgency text NULL,
  ADD COLUMN correct_urgency  text NULL;
ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_correction_source_check;
ALTER TABLE corrections
  ADD CONSTRAINT corrections_correction_source_check
  CHECK (correction_source = ANY (ARRAY['human_ui'::text, 'admin_reply'::text, 'human_skip'::text, 'human_urgency'::text]));
