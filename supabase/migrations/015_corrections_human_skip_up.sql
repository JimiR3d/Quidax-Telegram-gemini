-- Subtask 7 (/train Skip): allow a third correction_source value, 'human_skip'.
-- A Skip records a reviewer's "leave this one out" decision. It is stored as a
-- human-confirmed no-op (original_category = correct_category = the ticket's
-- current category) so the ticket drops out of the /train queue, but it is
-- deliberately EXCLUDED from few-shot injection and the /verify accuracy run
-- (server.ts filters .neq("correction_source","human_skip") on both paths).
-- Additive + reversible: existing human_ui / admin_reply rows are unaffected.
ALTER TABLE corrections
  DROP CONSTRAINT IF EXISTS corrections_correction_source_check;
ALTER TABLE corrections
  ADD CONSTRAINT corrections_correction_source_check
  CHECK (correction_source = ANY (ARRAY['human_ui'::text, 'admin_reply'::text, 'human_skip'::text]));
