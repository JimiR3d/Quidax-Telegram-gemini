-- Urgent-is-never-noise guard (2026-07-03).
--
-- Live ticket 25f6281d (a 100k scam complaint) sat at General Question /
-- High: an admin-reply reclassification rewrote the CATEGORY only, so the
-- High urgency survived into a noise category and the ticket vanished from
-- the Issues Only lane and the active KPIs. Fresh classifications cannot
-- create the combo (the policy forces Low urgency for General Question /
-- Community Chat), but side paths that never re-derive urgency can:
-- admin-reply reclassify, /train category fixes, dashboard urgency bumps,
-- and historical rows. The guard therefore lives at the READ layer.
--
-- CREATE OR REPLACE tickets_stats, carrying the live/022 body forward with
-- exactly two changes (mirrored in server.ts issuesOnlyOrClause — keep them
-- in sync):
--   1. p_issues_only filter: a High/Critical ticket stays in the lane
--      regardless of category. Dismissed stays out of the lane — the
--      Dismissed Audit surface flags that contradiction instead.
--   2. activeCount: a High/Critical active ticket counts in the active
--      denominator even in a noise category (it is real, unhandled demand).
--
-- No schema change; function body only. Reversible via the _down file
-- (restores the 022 body verbatim).

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
    -- Admin-rooted tickets are support output, not user demand: they belong
    -- in no KPI (Phase-4 fold; column is NOT NULL DEFAULT false).
    AND is_admin_message = false
    AND (NOT p_issues_only
         OR summary = 'Processing message...'
         OR (category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant', 'Community Chat')
             AND urgency <> 'Low')
         -- Urgent-is-never-noise: High/Critical is visible in the lane
         -- regardless of category (Dismissed excluded — the Dismissed Audit
         -- carries that contradiction).
         OR (urgency IN ('High', 'Critical') AND status <> 'Dismissed'))
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
  -- Spam/Irrelevant / Community Chat) UNLESS the classifier itself rated the
  -- ticket High/Critical (urgent-is-never-noise). 'Assumed Resolved' and
  -- 'Handed off' are NOT active (not listed here), so both are already
  -- excluded.
  'activeCount',        count(*) FILTER (WHERE status IN ('Open', 'In Review', 'Escalated', 'Awaiting User')
                                           AND (category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant', 'Community Chat')
                                                OR urgency IN ('High', 'Critical'))),
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
