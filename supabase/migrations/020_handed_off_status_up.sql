-- Phase 3: add the "Handed off" ticket disposition (rate honesty).
--
-- An admin reply that redirects the user OFF-PLATFORM ("send an email to
-- support@quidax.com" / "DM me") hands the ticket off — the resolution then
-- happens where the listener can never see it. Such tickets used to sit in an
-- active status (Open / In Review) forever, dragging the resolution rate down
-- and bloating "Active Issues".
--
-- "Handed off" is EXCLUDED from the active denominator entirely: it is neither
-- active (not in the active-status list) nor counted as a resolution (not in
-- resolvedCount / assumedResolvedCount). The JS rate layer therefore drops it
-- from both numerator and denominator with no code change.
--
-- Two changes, both additive/reversible:
--   1. Widen tickets_status_check to accept 'Handed off'.
--   2. CREATE OR REPLACE tickets_stats (carrying the live/017 body forward) to
--      add 'handedOffCount'. activeCount is unchanged — 'Handed off' is simply
--      not in the active-status list, so it is already excluded.

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'Open'::text,
    'In Review'::text,
    'Escalated'::text,
    'Awaiting User'::text,
    'Resolved'::text,
    'Assumed Resolved'::text,
    'Handed off'::text,
    'Dismissed'::text
  ]));

CREATE OR REPLACE FUNCTION public.tickets_stats(
  p_group_id text DEFAULT NULL,
  p_issues_only boolean DEFAULT false,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_urgency text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_today_start timestamptz DEFAULT NULL,
  p_today_end timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH filtered AS MATERIALIZED (
  SELECT status, urgency, category, created_at, resolved_at, first_admin_reply_at
  FROM tickets
  WHERE (p_group_id IS NULL OR group_id = p_group_id)
    AND (NOT p_issues_only
         OR summary = 'Processing message...'
         OR (category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant')
             AND urgency <> 'Low'))
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end)
    AND (p_search IS NULL
         OR summary ILIKE '%' || p_search || '%'
         OR category ILIKE '%' || p_search || '%'
         OR raw_text ILIKE '%' || p_search || '%')
    AND (p_urgency IS NULL OR urgency = p_urgency)
    AND (p_category IS NULL OR category = p_category)
)
SELECT jsonb_build_object(
  'openCount',          count(*) FILTER (WHERE status = 'Open'),
  -- Active denominator excludes noise categories (General Question / Praise /
  -- Spam/Irrelevant). 'Assumed Resolved' and 'Handed off' are NOT active (not
  -- listed here), so both are already excluded.
  'activeCount',        count(*) FILTER (WHERE status IN ('Open', 'In Review', 'Escalated', 'Awaiting User')
                                           AND category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant')),
  'inReviewCount',      count(*) FILTER (WHERE status = 'In Review'),
  'escalatedCount',     count(*) FILTER (WHERE status = 'Escalated'),
  'awaitingUserCount',  count(*) FILTER (WHERE status = 'Awaiting User'),
  'respondedCount',     count(*) FILTER (WHERE first_admin_reply_at IS NOT NULL
                                           AND created_at IS NOT NULL
                                           AND first_admin_reply_at >= created_at),
  'medianResponseMs',   (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM (first_admin_reply_at - created_at)) * 1000
                                ))
                           FROM filtered
                          WHERE first_admin_reply_at IS NOT NULL
                            AND created_at IS NOT NULL
                            AND first_admin_reply_at >= created_at),
  'resolvedCount',      count(*) FILTER (WHERE status = 'Resolved'),
  'assumedResolvedCount', count(*) FILTER (WHERE status = 'Assumed Resolved'),
  -- Off-platform hand-offs: counted separately, excluded from BOTH the active
  -- denominator and the resolution numerator (PulseDesk cannot observe the
  -- off-platform close, so it neither claims it nor is penalised for it).
  'handedOffCount',     count(*) FILTER (WHERE status = 'Handed off'),
  'resolvedTodayCount', count(*) FILTER (WHERE status = 'Resolved'
                                           AND resolved_at IS NOT NULL
                                           AND p_today_start IS NOT NULL
                                           AND resolved_at >= p_today_start
                                           AND resolved_at <= p_today_end),
  'criticalCount',      count(*) FILTER (WHERE urgency = 'Critical'
                                           AND status IS DISTINCT FROM 'Resolved'
                                           AND status IS DISTINCT FROM 'Dismissed'),
  'highCount',          count(*) FILTER (WHERE urgency = 'High'
                                           AND status IS DISTINCT FROM 'Resolved'
                                           AND status IS DISTINCT FROM 'Dismissed'),
  'mediumCount',        count(*) FILTER (WHERE urgency = 'Medium'
                                           AND status IS DISTINCT FROM 'Resolved'
                                           AND status IS DISTINCT FROM 'Dismissed'),
  'lowCount',           count(*) FILTER (WHERE urgency = 'Low'
                                           AND status IS DISTINCT FROM 'Resolved'
                                           AND status IS DISTINCT FROM 'Dismissed'),
  'ticketsTodayCount',  count(*) FILTER (WHERE p_today_start IS NOT NULL
                                           AND created_at >= p_today_start
                                           AND created_at <= p_today_end),
  'categoryCount',      (SELECT coalesce(jsonb_object_agg(cat, n), '{}'::jsonb)
                           FROM (SELECT coalesce(nullif(category, ''), 'Uncategorized') AS cat,
                                        count(*) AS n
                                   FROM filtered
                                  GROUP BY 1) c),
  'volumeByDay',        (SELECT coalesce(jsonb_object_agg(day, n), '{}'::jsonb)
                           FROM (SELECT to_char(created_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
                                        count(*) AS n
                                   FROM filtered
                                  WHERE created_at IS NOT NULL
                                  GROUP BY 1) v)
)
FROM filtered;
$$;
