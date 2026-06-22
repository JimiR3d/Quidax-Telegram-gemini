-- Revert Phase 3 "Handed off".
--
-- NOTE (dev-only): the constraint re-add will FAIL if any ticket still has
-- status = 'Handed off'. This down migration first parks those rows back to
-- 'In Review' so the narrower constraint can be restored. Run only against a
-- non-production / recovery DB.

UPDATE public.tickets
SET status = 'In Review', updated_at = now()
WHERE status = 'Handed off';

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'Open'::text,
    'In Review'::text,
    'Escalated'::text,
    'Awaiting User'::text,
    'Resolved'::text,
    'Assumed Resolved'::text,
    'Dismissed'::text
  ]));

-- Restore the migration-017 tickets_stats body (no handedOffCount).
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
