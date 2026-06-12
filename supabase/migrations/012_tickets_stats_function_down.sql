-- Rollback Milestone 4 DB-side stats: drop the aggregation function.
-- (The old server code computed stats in JS from a 5,000-row sample, so
-- rolling back the function requires rolling back the server code too.)
DROP FUNCTION IF EXISTS public.tickets_stats(
  text, boolean, timestamptz, timestamptz, text, text, text, timestamptz, timestamptz
);
