-- Phase 3 (2026-07-02 audit item 2): "Community Chat" category + KPI honesty fold.
--
-- Greetings / banter / price discussion used to route to 'Spam/Irrelevant' by
-- prompt design, conflating scams with benign chatter. 'Community Chat' is a
-- dedicated noise-lane category: auto-dismissed at classification time,
-- excluded from the Issues-Only view and the active denominator, reversible
-- in /train. Historical Spam/Irrelevant rows are NOT remapped (prospective
-- change — this is the one re-baseline event).
--
-- Two changes, both additive/reversible:
--   1. Widen tickets_category_check to accept 'Community Chat'. This MUST be
--      applied before the code deploy that can write the new category.
--   2. CREATE OR REPLACE tickets_stats (carrying the live/020 body forward):
--      - 'Community Chat' joins the noise-category lists (p_issues_only
--        filter + activeCount exclusion);
--      - the filtered CTE now excludes is_admin_message = true rows (approved
--        Phase-4 fold: 1 legacy admin-rooted Resolved ticket inflated
--        resolvedCount; admin messages are support output, never demand).

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_category_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_category_check
  CHECK (category = ANY (ARRAY[
    'Withdrawal Issue'::text,
    'Deposit Issue'::text,
    'KYC/Verification'::text,
    'Trading Problem'::text,
    'App Bug'::text,
    'Fee Complaint'::text,
    'Account Access'::text,
    'Network/Downtime'::text,
    'General Question'::text,
    'Praise'::text,
    'Spam/Irrelevant'::text,
    'Community Chat'::text
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
    -- Admin-rooted tickets are support output, not user demand: they belong
    -- in no KPI (Phase-4 fold; column is NOT NULL DEFAULT false).
    AND is_admin_message = false
    AND (NOT p_issues_only
         OR summary = 'Processing message...'
         OR (category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant', 'Community Chat')
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
  -- Spam/Irrelevant / Community Chat). 'Assumed Resolved' and 'Handed off'
  -- are NOT active (not listed here), so both are already excluded.
  'activeCount',        count(*) FILTER (WHERE status IN ('Open', 'In Review', 'Escalated', 'Awaiting User')
                                           AND category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant', 'Community Chat')),
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
