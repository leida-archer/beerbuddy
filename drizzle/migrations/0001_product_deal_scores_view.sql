-- 0001_product_deal_scores_view.sql
--
-- Backs the `product_deal_scores` matview type declared in
-- src/lib/db/schema.ts. v0 implements it as a regular VIEW because
-- ~14k weekly rows compute in <50ms — well under the per-request
-- budget. Promote to MATERIALIZED VIEW + nightly REFRESH when the
-- weekly read traffic warrants it (Week 8+).
--
-- Semantics:
--   - "Current price" is the most recent price_events row per
--     (store_id, canonical_product_id).
--   - "90-day median" is the percentile_cont(0.5) across price_events
--     for the same canonical_product_id, ALL stores, last 90 days.
--   - deal_score_pct is non-negative: prices at/above median return 0,
--     not a negative score. The UI doesn't show "anti-deals."

CREATE OR REPLACE VIEW product_deal_scores AS
WITH per_product_latest AS (
  SELECT DISTINCT ON (store_id, canonical_product_id)
    store_id,
    canonical_product_id,
    price_cents,
    was_price_cents,
    observed_at
  FROM price_events
  ORDER BY store_id, canonical_product_id, observed_at DESC
),
per_product_90d AS (
  SELECT
    canonical_product_id,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS median_90d_cents
  FROM price_events
  WHERE observed_at >= NOW() - INTERVAL '90 days'
  GROUP BY canonical_product_id
)
SELECT
  l.canonical_product_id,
  l.store_id,
  l.price_cents AS current_price_cents,
  l.was_price_cents,
  l.observed_at,
  ROUND(m.median_90d_cents)::integer AS median_90d_cents,
  CASE
    WHEN m.median_90d_cents IS NULL OR m.median_90d_cents <= 0 THEN NULL
    WHEN l.price_cents >= m.median_90d_cents THEN 0
    ELSE ROUND(100.0 * (m.median_90d_cents - l.price_cents) / m.median_90d_cents)::integer
  END AS deal_score_pct,
  NOW() AS refreshed_at
FROM per_product_latest l
LEFT JOIN per_product_90d m USING (canonical_product_id);
